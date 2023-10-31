/**
 * Define the Item type for JSDoc
 * @typedef {Object} Item
 * @property {string} description
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} tax
 *
 */

/**
 * Define document state
 * @typedef {Object} State
 * @property {boolean} hadError
 * @property {string} hadErrorMessage
 * @property {boolean} toEmail
 * @property {boolean} toPDF
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
 * @property {State} state
 * @property {string} reference
 * @property {number} total
 * @property {number} subtotal
 * @property {number} totalTax
 */
