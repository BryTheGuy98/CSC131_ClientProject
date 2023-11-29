const { initializeApp } = require( "firebase-admin/app" );
const { error, log } = require( "firebase-functions/logger" );
const { onDocumentWritten } = require( "firebase-functions/v2/firestore" );
const { getStorage } = require( "firebase-admin/storage" );
const { setGlobalOptions } = require( "firebase-functions/v2" );

const tectonic = require( "tectonic-js" );
const { Template } = require( "./lib/templating" );
const nodemailer = require( "nodemailer" );
const { cleanTmpDir, createFilesDir, getFilesDir, filePathOfNewFile } = require( "./lib/utils" );

// latex compiler needs a bit of memory
setGlobalOptions(
    {
      memory: "512MiB",
      timeoutSeconds: 500,
      maxInstances: 1,
    } );

initializeApp();

/**
 * The function to generate PDFs from a LaTeX Template
 *
 * onDocumentWritten runs every time the document is changed, so it will run again
 * if the toPDF flag under the state object is set to true
 */
exports.onToPDF = onDocumentWritten( "Invoice/{invoiceId}", async ( event ) => {
  // get document state from before change and after change
  const previousDocument = event.data.before;
  const currentDocument = event.data.after;

  // get data from before change and after change
  const previousData = previousDocument.data();
  const currentData = currentDocument.data();

  // document state flags
  const previousState = previousData.state;
  const currentState = currentData.state;

  /*
    Because onDocumentWritten runs every time a change is made, we need to handle some situations that will result in
    infinite loops or needless creation of instances

    1. If the toPDF flag is false, immediately exit.
    2. If the document has been deleted, immediately exit.
    3. If the toPDF flag has not changed, immediately exit.
  */
  if ( !currentState.toPDF ||
      !currentDocument.exists ||
  ( previousDocument.exists && previousState.toPDF === currentState.toPDF ) ) {
    return null;
  }
  /* our templates and assets are stored in cloud storage buckets.  */
  const storage = getStorage();
  const bucket = storage.bucket();

  // intermediary work. These variables store names of files
  const invoiceNumber = currentData.invoiceNumber;
  // both the PDF and .tex file will have this name
  const fileName = `invoice_${invoiceNumber}`;
  // file name with extension
  const latexFileNameWithExt = fileName + ".tex";
  const pdfFileNameWithExt = fileName + ".pdf";

  // paths where both the latex file and pdf file will be written
  const latexFilePath = filePathOfNewFile( latexFileNameWithExt );
  const pdfFilePath = filePathOfNewFile( pdfFileNameWithExt );

  /* When email sending fails, it sets the "toEmail" flag to true.
    If it is true, and the pdf file is already generated, then skip all the other work
    and try to send the email again.
  */
  if ( currentState.toEmail && await bucket.file( `invoices/${pdfFileNameWithExt}` ).exists() ) {
    log( `Invoice ${invoiceNumber}: Step 1: Invoice already exists. Sending Email...` );
    await sendEmail( currentData.clientEmail, invoiceNumber, pdfFileNameWithExt, pdfFilePath );
    log( "   |--- Email Sent" );
    return event.data.after.ref.update( {
      state: {
        hadError: false,
        hadErrorMessage: "",
        toEmail: false,
        toPDF: false,
      } } );
  }
  const folder = currentData.template;

  let filesDir;
  /* Step 1
    We need to be able to clean up our temporary files that we download/create to
    minimize memory use, so we create a folder in os.tmpdir that can be deleted wholesale later.
  */
  log( `Invoice ${invoiceNumber}: Step 1: Setting up Functions environment...` );
  try {
    await createFilesDir();
    filesDir = getFilesDir();
    log( "   |--- Setup complete." );
  } catch ( e ) {
    error( `
      Something went wrong with creating the files directory in os.tmpdir.\n
      Please read the following error message.\n
      ${e}
    ` );

    // if we could not create that folder, exit early
    return event.data.after.ref.update( {
      state: {
        hadError: true,
        hadErrorMessage: "Could not create temp folder. Please read logs",
        toEmail: false,
        toPDF: false,
      },
    } );
  }

  let texBuffer;
  /* Step 2
    Download the LaTeX template as a buffer and its related assets to the
    previously created folder in os.tmpdir.

    Templates are stored with the following schema:
      In our cloud bucket, under the parent folder "templates," the template name will be the "folder",
      where in it:
        - template.tex is the main folder
        - the subfolder assets will contain all related assets (imgs, etc)
  */
  log( `Invoice ${invoiceNumber}: Step 2: Getting LaTeX templates...` );
  try {
    texBuffer = await bucket
        .file( `templates/${folder}/template.tex` )
        .download();


    // see https://cloud.google.com/storage/docs/samples/storage-list-files-with-prefix
    // get our assets stored in {templateFolder}/assets/
    await bucket.getFiles(
        { prefix: `templates/${folder}/assets/`, delimiter: "/" },
        ( err, files ) => {
          files
              .filter(
                  ( file ) =>
                    // this function also lists folders, so filter them out
                    file.name.includes( "." ) )
              .forEach( ( file ) => {
                // then download the files

                // cloud storage name contains the path, so strip it out
                const name = file.name.substring(
                    file.name.lastIndexOf( "/" ) );
                file.download( { destination: filesDir + name } );
              } );
        } );
    log( "   |--- Template files downloaded." );
  } catch ( e ) {
    error( `
      Something went wrong with downloading the template and related assets.\n
      Please read the error below.\n
      ${e}
    ` );

    // if we cannot get these files, exit early
    return event.data.after.ref.update( {
      state: {
        hadError: true,
        hadErrorMessage: "Could not create get bucket files. Please read logs",
        toEmail: false,
        toPDF: false,
      },
    } );
  }


  /* Step 3
    Create the LaTeX file by substituting the templating language for actual
    FireStore data.
  */
  log( `Invoice ${invoiceNumber}: Step 3: Inserting data using templating language...` );
  const templater = new Template( texBuffer );
  try {
    await templater
        .substitute( currentData )
        .writeToFile( latexFilePath, { encoding: "utf-8", flag: "w" } );
    log( "   |--- Templating complete." );
  } catch ( e ) {
    error( `
        Something went wrong with templating.\n
        Please read the error below.\n
        ${e}
      ` );
    // if we cannot create the .tex file, exit early.
    return event.data.after.ref.update( {
      state: {
        hadError: true,
        hadErrorMessage: "Could not create tex file from template. Please read logs",
        toEmail: false,
        toPDF: false,
      },
    } );
  }

  /* Step 4
    Compile the final LaTeX file with the tectonic utility.
  */
  log( `Invoice ${invoiceNumber}: Step 4: Compiling LaTeX into PDF...` );
  try {
    await tectonic( latexFilePath + " -o " + filesDir );
    log( "   |--- Compilation complete." );
  } catch ( e ) {
    error( `
    Something went wrong with compiling the LaTeX.\n
    Please read the error below.\n
    ${e}
    ` );
    // if we cannot compile the LaTeX, exit early
    return event.data.after.ref.update( {
      state: {
        hadError: true,
        hadErrorMessage: "Could not compile the tex file. Please read logs",
        toEmail: false,
        toPDF: false,
      },
    } );
  }

  /* Step 5
    Upload the final PDF to our cloud bucket, under the "invoices" folder
  */
  log( `Invoice ${invoiceNumber}: Step 5: Uploading PDF to Cloud bucket...` );
  try {
    await bucket.upload( pdfFilePath, { destination: `invoices/${pdfFileNameWithExt}` } );
    log( "   |--- Upload complete." );
  } catch ( e ) {
    error( `
    Something went wrong with uploading the PDF.\n
    Please read the error below.\n
    ${e}
    ` );
    // if we cannot upload the PDF, exit early
    return event.data.after.ref.update( {
      state: {
        hadError: true,
        hadErrorMessage: "Could not upload the PDF file to a bucket. Please read logs",
        toEmail: false,
        toPDF: false,
      },
    } );
  }

  /* Step 6
    Send the email. If this step fails, we set toEmail to true to indicate this step
    did not compute.
  */
  log( `Invoice ${invoiceNumber}: Step 6: Sending Email...` );
  try {
    await sendEmail( currentData.clientEmail, invoiceNumber, pdfFileNameWithExt, pdfFilePath );
    log( "   |--- Email Sent" );
  } catch ( e ) {
    error( `
    Something went wrong with sending the email.\n
    Please read the error below.\n
    ${e}
    ` );
    return event.data.after.ref.update( {
      state: {
        hadError: true,
        hadErrorMessage: "Could not send the email. Please read logs",
        toEmail: true,
        toPDF: false,
      },
    } );
  }

  /* Step 7
    Clean up the folder created in os.tmpdir to prevent it from persisting
    between instances and taking up bandwidth
  */
  log( `Invoice ${invoiceNumber}: Step 7: Cleaning up Functions environment...` );

  try {
    await cleanTmpDir();
    log( "   |--- Cleanup complete." );
  } catch ( e ) {
    error( `
    Something went wrong with cleaning up the temp folder.\n
    Please read the error below.\n
    ${e}
    ` );
    // if we cannot clean the temp folder, exit early
    return event.data.after.ref.update( {
      state: {
        hadError: true,
        hadErrorMessage: "Could not clean up the temp folder. Please read logs",
        toEmail: false,
        toPDF: false,
      },
    } );
  }

  log( `Invoice ${invoiceNumber}: Complete.` );
  return event.data.after.ref.update( {
    state: {
      hadError: false,
      hadErrorMessage: "",
      toEmail: false,
      toPDF: false,
    },
  } );
} );

/**
 * Email sender function.
 * @param {string} recieverEmail
 * @param {string} invoiceNum
 * @param {string} fileName
 * @param {string} filePath
 */
async function sendEmail( recieverEmail, invoiceNum, fileName, filePath ) {
  const mailTransport = nodemailer.createTransport( {
    service: "gmail",
    auth: {
      user: `${process.env.USER_EMAIL}`,
      pass: `${process.env.USER_PASS}`,
    },
  } );

  const mailOpts = {
    from: `DevWave ${process.env.USER_EMAIL}`,
    to: recieverEmail,
    subject: `TESTING FIREBASE: Your Invoice for Order ${invoiceNum} from Ansync, INC`,
    attachments: [
      {
        filename: fileName,
        path: filePath,
      },
    ],
  };
  await mailTransport.sendMail( mailOpts );
}
