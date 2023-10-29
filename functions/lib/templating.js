const { writeFile } = require( "fs/promises" );

const VARIABLE_REGEX = /~(?!\.)([\w\d.]+)/g;
const BLOCK_REGEX = /~\.([\s\S]*?)~\.end/gm;
const BLOCK_ITEMS_REGEX = /\.([\w\d.]+)/g;

/**
 * A class in the style of the Python built-in Template class.
 * See: https://docs.python.org/3/library/string.html#template-strings
 */
class Template {
  #str;
  /**
   *
   * @param {Buffer} buffr Download the file as a buffer from Firebase, so we
   * don't waste time having to download, then read data.
   * The buffer data is then converted to a string.
   */
  constructor( buffr ) {
    this.#str = buffr.toString();
  }
  /**
   * @return {string} return the full string of LaTeX file.
   */
  get str() {
    return this.#str;
  }

  /**
   * @param {Buffer} buffr Download the file as a buffer from Firebase, so we
   * don't waste time having to download, then read data.
   * The buffer data is then converted to a string.
   */
  set str( buffr ) {
    this.#str = buffr.toString();
  }
  /**
   * An internal helper method to replace templates in a string with data.
   * @param {IteratableIterator<RegExpMatchArray>} matches return matches generated
   * from string.matchAll JS regex function.
   * @param {string} str parts of a string, or the full string to act upon.
   * @param {Data} data real data to replace templates with.
   * @return {string} return a modified copy of the string, now with the data substituted.
   */
  #variableParser( matches, str, data ) {
    // for each regex match
    for ( const match of matches ) {
      // get the actual matched string (which will be used to replace with data)
      // and then the capture group variable (which is the name of a data property in FireStore)
      const [ regex, varName ] = match;
      // replace the matched string with data
      str = str.replace( regex, data[varName] );
    }
    return str;
  }
  /**
   * External Template API method to execute template substitutions on a LaTeX string.
   * For information on how templates work, please read the README.
   * @param {Data} data real-world data to substitute in string
   * @return {Template} returns "this" object to allow for function chainging.
   */
  substitute( data ) {
    // find simple variables (1D) to replace
    const dataVars = this.#str.matchAll( VARIABLE_REGEX );
    // find "blocks" to replace; more intense operation (2D)
    const blocks = this.#str.matchAll( BLOCK_REGEX );

    // 1. Parse simple variables
    // no complex operations needed
    this.#str = this.#variableParser( dataVars, this.#str, data );

    // 2. Parse Blocks (more involved)
    for ( const match of blocks ) {
      // blocks need inner loops, so this final string represents what we will finally
      // substitute into the string.
      let finalStr = "";

      // get the matched string
      const [ regex ] = match;
      // first line is the head, which contains the block type and complex data structure
      // to interact with
      // the rest can be grouped together
      const [ head, ...rest ] = regex.split( "\n" );

      // to get the main body of the block, get rid of the last line, which only contains "~.end"
      rest.pop();
      // join the rest back together
      const blockBody = rest.join( "\n" );

      // extract the block type and complex data name from the first line
      const [ blockType, name ] = head.match( BLOCK_ITEMS_REGEX );

      // strip the period from before the name
      const dataName = name.substring( 1 );

      // and then, based on that block type
      switch ( blockType ) {
        case ".for":
          // for each item in our FireStore complex structure
          // in a for loop, the body line(s) will repeat for each item
          data[dataName].forEach( ( item ) => {
            let section = blockBody;
            // substitute in the variables in a line
            const varsToSubstitute = section.matchAll( BLOCK_ITEMS_REGEX );
            section = this.#variableParser( varsToSubstitute, section, item );

            // add this line to our final string
            finalStr += section + "\n";
          } );
          break;
        default:
          // if there is no handling for a body type, throw an error.
          throw new Error( "Undefined body template. Please include an implementation for this in the body class" );
      }

      // once we've finished all to do with a single block, substitute it in.
      this.#str = this.#str.replace( regex, finalStr );
    }

    // return
    return this;
  }
  /**
   * A wrapper function around the NodeJS writeFile function to act specifically
   * upon Template(s).
   * @param {any} file
   * @param {any} options
   */
  async writeToFile( file, options ) {
    await writeFile( file, this.#str, options );
  }
}

module.exports = {
  Template,
};
