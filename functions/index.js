// eslint-disable-next-line no-unused-vars
const { Timestamp } = require( "firebase-admin/firestore" );
const { initializeApp } = require( "firebase-admin/app" );
const { error } = require( "firebase-functions/logger" );
const { onDocumentWritten } = require( "firebase-functions/v2/firestore" );
const { getStorage } = require( "firebase-admin/storage" );
const { setGlobalOptions } = require( "firebase-functions/v2" );

const { writeFile, readdir } = require( "fs/promises" );
const os = require( "os" );

const tectonic = require( "tectonic-js" );
const { Template } = require( "./lib/templating" );
const { log } = require( "console" );
// const nodemailer = require( "nodemailer" );

setGlobalOptions(
    {
      memory: "1GB",
      timeoutSeconds: 300,
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

  const { folder, main } = currentData.template;

  try {
    const texBuffer = await bucket
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
                file.download( { destination: os.tmpdir + name } );
              } );
        } );


    const invoiceNumber = currentData.invoiceNumber;
    const fileName = `invoice_${invoiceNumber}`;

    // create our final latex file
    const newTex = new Template( texBuffer ).substitute( currentData );
    await writeFile( os.tmpdir + `/${fileName}.tex`, newTex, { encoding: "utf-8", flag: "w" } );

    // process and compile it
    await tectonic( os.tmpdir + `/${fileName}.tex -o ` + os.tmpdir );

    // and then save it to the invoices folder
    await bucket.upload( os.tmpdir + `/${fileName}.pdf`, { destination: `invoices/${fileName}.pdf` } );
  } catch ( e ) {
    error( e );
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

