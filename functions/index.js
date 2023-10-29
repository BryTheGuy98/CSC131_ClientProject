// eslint-disable-next-line no-unused-vars
const { initializeApp } = require( "firebase-admin/app" );
const { error } = require( "firebase-functions/logger" );
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
      memory: "1GB",
      timeoutSeconds: 500,
    } );

initializeApp();

exports.onRunPDF = onDocumentWritten( "Invoice/{invoidId}", async ( event ) => {
  const previousDocument = event.data.before;
  const currentDocument = event.data.after;

  const previousData = previousDocument.data();
  const currentData = currentDocument.data();

  if ( !currentDocument.data().runPDF ||
      !currentDocument.exists ||
  ( previousDocument.exists && previousData.runPDF === currentData.runPDF ) ) {
    return null;
  }
  const storage = getStorage();
  const bucket = storage.bucket();

  const { folder } = currentData.template;

  await createFilesDir();
  const filesDir = getFilesDir();

  let texBuffer;
  try {
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
    } catch ( e ) {
      error( "dir error" );
    }
    const invoiceNumber = currentData.invoiceNumber;
    const fileName = `invoice_${invoiceNumber}`;
    const fileNameWithExt = fileName + ".tex";

    const latexFilePath = filePathOfNewFile( fileNameWithExt );
    const pdfFilePath = filePathOfNewFile( fileName + ".pdf" );
    // create our final latex file
    const templater = new Template( texBuffer );
    try {
      await templater
          .substitute( currentData )
          .writeToFile( latexFilePath, { encoding: "utf-8", flag: "w" } );
    } catch ( e ) {
      error( `
        Something went wrong with templating. Please read the error.
        ${e}
      ` );
    }

    // process and compile it
    await tectonic( latexFilePath + " -o " + filesDir );


    await bucket.upload( pdfFilePath, { destination: `invoices/${fileName}.pdf` } );
  } catch ( e ) {
    error( e );
  }

  try {
    await cleanTmpDir();
  } catch ( e ) {
    error( `
      Something went wrong cleaning up the temporary directory. Please read the error message.\n
      ${e}.
    ` );
  }

  return event.data.after.ref.update( {
    runPDF: false,
    sendEmail: true,
  } );
} );


// const mailTransport = nodemailer.createTransport( {
//   service: "gmail",
//   auth: {
//     user: `${process.env.USER_EMAIL}`,
//     pass: `${process.env.USER_PASS}`,
//   },
// } );
// exports.sendEmail = onDocumentWritten( "Invoice/{invoidId}", async ( event ) => {
//   const previousDocument = event.data.before;
//   const currentDocument = event.data.after;

//   const previousData = previousDocument.data();
//   const currentData = currentDocument.data();


//   if ( !currentDocument.data().sendEmail ||
//       !currentDocument.exists ||
//   ( previousDocument.exists && previousData.sendEmail === currentData.sendEmail ) ) {
//     return null;
//   }

//   const fileName = `invoice_${currentData.invoiceNumber}.pdf`;
//   const downloadPath = `${os.tmpdir}/${fileName}`;

//   const storage = getStorage();
//   const bucket = storage.bucket();

//   await bucket.file( `invoices/${fileName}` ).download( { destination: downloadPath } );

//   const mailOpts = {
//     from: `DevWave ${process.env.USER_EMAIL}`,
//     to: currentData.clientEmail,
//     subject: `TESTING FIREBASE: Your Invoice for Order ${currentData.invoiceNumber} from Ansync, INC`,
//     attachments: [
//       {
//         filename: fileName,
//         path: downloadPath,
//       },
//     ],
//   };

//   try {
//     await mailTransport.sendMail( mailOpts );
//   } catch ( e ) {
//     error( e );
//   }
//   return event.data.after.ref.update( {
//     sendEmail: false,
//   } );
// } );

