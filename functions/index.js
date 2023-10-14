// eslint-disable-next-line no-unused-vars
const { Timestamp } = require( "firebase-admin/firestore" );
/**
 * Define the Item type for JSDoc
 * @typedef {Object} Item
 * @property {string} description
 * @property {number} quantity
 * @property {number} unitPrice
 *
 */

/**
 * Define the Document properties for JSDoc
 * @typedef {Object} Data
 * @property {string} clientName
 * @property {string} clientPO
 * @property {number} clientID
 * @property {string} paymentTerms
 * @property {string} termsAndConditions
 * @property {Timestamp} dueDate
 * @property {Timestamp} invoiceDate
 * @property {string} invoiceNumber
 * @property {string} description
 * @property {Item[]} items
 * @property {string} reference
 * @property {boolean} runPDF
 */

const { initializeApp } = require( "firebase-admin/app" );
const { error } = require( "firebase-functions/logger" );
const { onDocumentWritten } = require( "firebase-functions/v2/firestore" );
const { getStorage } = require( "firebase-admin/storage" );
const { setGlobalOptions } = require( "firebase-functions/v2" );

const { writeFile } = require( "fs/promises" );
const os = require( "os" );

const tectonic = require( "tectonic-js" );


setGlobalOptions(
    {
      memory: "1GB",
      timeoutSeconds: 300,
    } );

initializeApp();

/**
 * Iterate over the items property in a document to generate a latex table
 * @param {Item[]} items
 * @return {String} a String
 */
function createTable( items ) {
  let str = "\\begin{invoicetable}\n";
  items.forEach( ( item ) => {
    str += `\\invoiceitem{${item.description}}{${item.quantity}}{${item.unitPrice}}{}\n`;
  } );

  str += "\\end{invoicetable}";

  return str;
}

/**
 * Creates the latex file to compile.
 * Does regex replaces for dynamic data and then writes it to a file in the tmpdir
 * @param {Data} data Take in the document data from Firestore
 * @param {Buffer} buffr This is the template buffer downloaded from Cloud Bucket
 * @return {number} The invoice number
 */
async function createLatex( data, buffr ) {
  const { clientName,
    clientPO,
    clientID,
    dueDate,
    termsAndConditions,
    invoiceDate,
    invoiceNumber,
    description,
    items,
    reference } = data;
  const dataTable = createTable( items );

  const dataToRegexMap = [
    [ clientName, /{{clientName}}/ ],
    [ clientPO, /{{clientPO}}/ ],
    [ clientID, /{{clientID}}/ ],
    [ dueDate, /{{dueDate}}/ ],
    [ invoiceDate.toDate().toDateString(), /{{invoiceDate}}/ ],
    [ invoiceNumber, /{{invoiceNumber}}/ ],
    [ description, /{{description}}/ ],
    [ dataTable, /{{invoiceTable}}/ ],
    [ termsAndConditions, /{{terms}}/ ],
    [ reference, /{{reference}}/ ] ];

  const substitutedString = dataToRegexMap.reduce(
      ( oldStr, [ data, regex ] ) => oldStr.replace( regex, data ),
      buffr.toString() );

  await writeFile( os.tmpdir + `/invoice_${invoiceNumber}.tex`, substitutedString, { encoding: "utf-8", flag: "w" } );
  return invoiceNumber;
}

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

  try {
    const { folder, assets, main } = currentData.template;

    const texBuffer = await bucket
        .file( `templates/${folder}/${main}` )
        .download();

    await Promise.all( assets.map( ( asset ) => async () => bucket.file( `templates/${folder}/${asset}` ).download() ) );

    const invoiceNumber = await createLatex( currentData, texBuffer );
    const fileName = `invoice_${invoiceNumber}`;
    await tectonic( os.tmpdir + `/${fileName}.tex -o ` + os.tmpdir );
    await bucket.upload( os.tmpdir + `/${fileName}.pdf`, { destination: `invoices/${fileName}.pdf` } );
  } catch ( e ) {
    error( e );
  }


  return event.data.after.ref.update( {
    runPDF: false,
  } );
} );
