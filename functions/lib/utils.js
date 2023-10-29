const { existsSync } = require( "fs" );
const { rm, mkdir } = require( "fs/promises" );
const os = require( "os" );
const path = require( "path" );

/**
 * We rely on the temporary directory of a function instance to compile LaTeX.
 * @return {string} temporary directory location.
 */
function getFilesDir() {
  return path.join( os.tmpdir(), "latex" );
}
/**
 * Create a folder for our latex files
 */
async function createFilesDir() {
  const filesDir = getFilesDir();
  if ( !existsSync( filesDir ) ) {
    await mkdir( filesDir );
  }
}

/**
 * @return {string} a full file path to write a file to
 */
function filePathOfNewFile( ...args ) {
  return path.join( getFilesDir(), ...args );
}
/**
 * We rely on the temporary directory of a function instance to compile LaTeX.
 * Sometimes, the tmpDir persists between instances and takes up memory, so we need
 * to make sure to clean it up every time.
 *
 * We have some permission errors with simply deleting the whole folder,
 * so we follow this solution:
 *  https://stackoverflow.com/questions/44653533/cleanup-temp-directory-firebase-cloud-functions
 */
async function cleanTmpDir() {
  await rm( getFilesDir(), { recursive: true, force: true } );
}

module.exports = {
  getFilesDir,
  createFilesDir,
  filePathOfNewFile,
  cleanTmpDir,
};
