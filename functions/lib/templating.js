const { log } = require( "firebase-functions/logger" );

const VARIABLE_REGEX = /~(?!\.)([\w\d.]+)/g;
const BLOCK_REGEX = /~\.([\s\S]*?)~\.end/gm;
const BLOCK_ITEMS_REGEX = /\.([\w\d.]+)/g;

// .name .unitPrice \\
// ~.end

/**
 *
 */
class Template {
  #str;
  /**
   *
   * @param {Buffer} buffr
   */
  constructor( buffr ) {
    this.#str = buffr.toString();
  }
  /**
   *
   */
  get str() {
    return this.#str;
  }

  /**
   * @param {Buffer} buffr
   */
  set str( buffr ) {
    this.#str = buffr.toString();
  }
  /**
   * @param {IteratableIterator<RegExpMatchArray>} matches
   * @param {string} str
   * @param {Data} data
   * @return {string}
   */
  #variableParser( matches, str, data ) {
    for ( const match of matches ) {
      const [ regex, varName ] = match;
      str = str.replace( regex, data[varName] );
    }
    return str;
  }
  /**
   * @param {Data} data
   * @return {String} final
   */
  substitute( data ) {
    const dataVars = this.#str.matchAll( VARIABLE_REGEX );
    const blocks = this.#str.matchAll( BLOCK_REGEX );

    if ( dataVars.length == 0 ) {
      log( "No variables to substitute" );
      return;
    }

    // parse basic variables
    this.#str = this.#variableParser( dataVars, this.#str, data );

    for ( const match of blocks ) {
      // final string to put in when we are done
      let finalStr = "";

      const [ regex ] = match;
      const [ head, ...rest ] = regex.split( "\n" );

      // get rid of the end line
      rest.pop();

      // get type from block as well as items
      const [ blockType, arr ] = head.match( BLOCK_ITEMS_REGEX );
      const body = rest.join( "\n" );

      switch ( blockType ) {
        case ".for":
          data[arr.substring( 1 )].forEach( ( item, indx ) => {
            let section = body;
            const varsToSubstitute = section.matchAll( BLOCK_ITEMS_REGEX );
            section = this.#variableParser( varsToSubstitute, section, item );
            finalStr += section + "\n";
          } );
          break;
        default:
          break;
      }

      this.#str = this.#str.replace( regex, finalStr );
    }

    // return
    return this.#str;
  }
}

module.exports = {
  Template,
};
