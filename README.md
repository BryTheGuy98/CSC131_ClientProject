# PDF Invoice Generator

**CSC 131 Section 02, Dr. Ahmed Salem, Fall 2023**.
**Client:** Ansync Inc, Mr. Sam Miller.
**Group:** Bryan Robare, Huy Dao, Hadia Amiri, Keerat Khandpur, Jacob Rutter, Akal-Ustat Singh.


 Table of Contents
  - [I. Overview and Technologies](#i-overview-and-technologies)
    - [A. Google Cloud](#a-google-cloud)
      - [i. Firestore](#i-firestore)
        - [State](#state)
        - [Prices](#prices)
      - [ii. Cloud Storage](#ii-cloud-storage)
      - [iii. Cloud Functions](#iii-cloud-functions)
    - [B. Latex](#b-latex)
      - [i. Tectonic](#i-tectonic)
      - [ii. Templating](#ii-templating)
        - ["Simple" Variables](#simple-variables)
        - [Blocks](#blocks)
          - [a. "for"](#a-for)
          - [a. "date"](#a-date)
    - [C. Node Mailer](#c-node-mailer)
  - [II. Project Structure](#ii-project-structure)
    - [A. tectonic](#a-tectonic)
    - [B. functions](#b-functions)
    - [C. dir](#c-dir)
  - [III. Development](#iii-development)
    - [A. Environment](#a-environment)
    - [B. Local](#b-local)
    - [C. Cloud](#c-cloud)
  - [IV. Future](#c-cloud)

## I. Overview and Technologies
This client project is implemented using the Google Cloud Platform (Firebase), NodeJS, and LaTeX.
### A. Google Cloud

#### i. Firestore
This generator uses the Firebase Firestore as its datastore. This means that for invoices that need to be generated, data must first be inserted into a new Firestore document. The data follows the structure below:
```
{
  clientID: string,
  clientName: string,
  clientPO: string,
  description: string
  dueDate: timestamp,
  invoiceNumber: string,
  items: {
    description: string,
    quantity: number,
    unitPrice: number,
    tax: number
  }[], // array of such items
  paymentTerms: string,
  reference: string,
  template string,
  total: number,
  totalTax: number,
  subtotal: number,
  state: {
    hadError: boolean, // default false
    hadErrorMessage: string, // default null,
    toEmail: boolean, // default false,
    toPDF: boolean, // default true when created.
  }
}
```
For an example implementation of this data document, run the Firebase Emulator [locally](#b-local).
  > [!NOTE]
  > *The `template` property denotes the location of the LaTeX template in [Cloud Storage](#ii-cloud-storage).
##### State
The document object contains a `state` object to communicate between the user and the [Firebase Function](#iii-cloud-functions). It contains the following data:
1. `toPDF`: When the document is created, this flag will be set to true. This fires off the Function, which will run, generate the PDF, send the Email, and upload the PDF to [Cloud Storage](#ii-cloud-storage). 
2. `hadError`: This notifies the user that an error occurred at a point during the Function process.
3. `hadErrorMessage`: This provides the user with insight into the error that occurred during the Function process. It indicates which step of the process failed and directs the user to the Function logs for further detail.
4. `toEmail`: This flag is only used in cases of an error during the Email sending step. If it fails, it sets this flag to true so that the user can set the `toPDF` flag back to true to re-execute the function. When this flag is true during the re-run, the function will not recompile the LaTeX, saving bandwidth, and will instead only re-attempt to send the Email. 
##### Prices
As discussed in the 2<sup>nd</sup> Demo Session on October 17<sup>th</sup>, 2023, financial data would be handled by an external system (such as an accounting software, etc.). Thus, this generator app merely takes in that information instead of being responsible for that information. Due to this, each `item` in the `items` array requires a `unitPrice` and `tax`* property and the document object requires the `subtotal`, `totalTax`, and `total` properties.

  > [!NOTE]
  > *When the tax for an item in non-taxable, leaving this property null tells the program to place `N/A` on the final invoice. 

#### ii. Cloud Storage
This application uses Firebase Cloud Storage to store LaTeX templates and generated invoice PDFs. The storage bucket contains two folders:
1. `templates`: this folder contains all possible templates. Templates are stored as sub-folders, which then contain the main LaTeX file, named `template.tex` and any related assets (e.g., images, etc.) under a further subfolder called `assets`. A further example can be viewed through the [Firebase Emulator](#b-local) locally. 

        templates
            ├── DevWave
            │   ├── assets
            │   │   ├── group_photo.png
            │   │   ├── latex_class.cls
            │   │   └── logo.png
            │   └── template.tex
            └── default
                ├── assets
                │   └── logo.png
                └── template.tex


2.  `invoices`: Generated Invoice PDFs are uploaded to this folder upon Function completion.
  
#### iii. Cloud Functions
The Cloud Function implementation contains a single function,  `onToPDF`, which runs whenever the flag `toPDF` is set to true. The function follows these basic steps:
1. Check if the `toEmail` flag is true and the PDF is already generated (denotes a previous error at step #7). If this check is true, then it skips LaTeX compilation to retry *only* sending an Email, saving bandwidth.
2. Otherwise, it begins setting up the local folder necessary to read from Cloud Storage.
3. Download templates and assets from Cloud Storage.
4. Substitute real data from the document into the LaTeX using the [templating](#ii-templating) system.
5. Compile the LaTeX using [Tectonic](#a-tectonic).
6. Upload the compiled PDF to [Cloud Storage](#ii-cloud-storage).
7. Send the Email to the client using [nodemailer](#c-node-mailer).
8. Clean up the temporary files, saving bandwidth on future Function instances.

Each step of the process has its paired error message to inform the user.

### B. Latex
#### i. Tectonic
Traditionally, LaTeX compilation has been done using the `pdflatex` command-line tool. However, it requires a complete installation of the [LaTeX package](https://www.latex-project.org/get/), which increases the size of the code (upload bandwidth) and increases bandwidth used during compilation. 

Thus, this application uses the [Tectonic](https://tectonic-typesetting.github.io/en-US/) compiler for LaTeX. This is a Rust-based LaTeX compiler that is small in binary size and uses less bandwidth during compilation. For further usage information in how this compiler is provided to the Firebase Function instances and local development, see the section on [Tectonic development](#a-tectonic). 

#### ii. Templating

This application implements a custom templating syntax in order to fill in latex. This templating flavor implements two distinct types.


##### "Simple" Variables
This type of templating implement substitutes "simple" data types, or primitives, such as numbers, strings, etc. It follows the following format:
```
text text text ~{variable} more text ~{variable}
```
For example, if we have the following data - `last = "Son"` and  `first = "Nick"`, we would insert the following template into LaTeX:
```
Hi! My name is ~last, ~first.
```
This would then be substituted by the Firebase Function as:
```
Hi! My name is Son, Nick.
```

This follows for all "shallow" data in the Firebase document (i.e, everything excluding `maps`, `arrays`, and `Timestamps`): `total`, `subtotal`, `totalTax`, etc.

##### Blocks
Complex data structures, namely `arrays`, nested `maps`, and `Timestamps`, require a different implementation that internally is built upon the "simple" logic, but is tailor-suited for them. To this end, the templating allows for "blocks" to be declared. They are described using the following format:
```
~.{block name} .{complex data structure name}
  text text text .{variable in structure} text text .{another variable in structure}
~.end
```
Because these blocks are more complicated than simple variables, they require a separate implementation in the Templating class in [`templating.js`](functions/lib/templating.js). 

The application implements two blocks by default.
###### a. "for"
The for block loops over an array (for the purposes of our data, this is the array of items).
```
~.for .items
This is item one's description: .description and unit price: .unitPrice
~.end
```

###### a. "date"
Firestore implements a date type called `Timestamp`. This does not convert identically into the native JS `Date` type, and thus has to be converted. To make this conversion easier, the `date` block has been provided. A date block can be added to LaTeX with:
```
~.date .dueDate .toDate .toDateString ~.end
```
where `dueDate` is the `Timestamp` data, and `toDate` and `toDateString` are functions applied to the date. 

### C. Node Mailer

This application implements emailing a PDF to the client using [nodemailer](https://nodemailer.com). Nodemailer is ideal for this process, because nodemailer does not incur any charges for using the `gmail` provider (which is nice because this project is already hosted on Google infrastructure). 

Nodemailer does require some environment variables, which are described in [setting up local development](#b-local). 

## II. Project Structure

The project has three main folders:

> [!IMPORTANT]
> The root folder contains a `package-lock` and `package` file, but these contain no modules. They instead provides some helper npm commands, such as installation for the `tectonic` binary and running the local Firebase emulator. The `package-lock` and `package` file dealing with actual node modules and the code are under the `functions/` directory.

### A. tectonic

This module is a wrapper module around the [Tectonic](#i-tectonic) LaTeX compiler.

**The need**: Simply uploading the Tectonic binary within the `function` code uploaded does not give it the permissions necessary to read and write files. This is not optimal as this compiler needs to (1) read the input `.tex` file and (2) compile it to PDF.
**The solution**: Installed node modules get all permissions on the host OS (`777`), thus creating a local node module which will allow us to compile LaTeX. 

The local node module provides an interface to interact with the included binaries: 
1. `linux x64`: The Google Function host runs on Ubuntu 22.04 x64.
2. `macOS x64`: Binary for Intel Mac.
3. `macOS arm64`: Binary for Mac on M-series chips.

The current binaries are the latest Tectonic version, [0.14.1](https://github.com/tectonic-typesetting/tectonic/releases/tag/continuous). 

To install this local module, run `npm run rebuild:tectonic`(a helper npm command). 
> [!IMPORTANT]
> Currently, this tectonic compiled package is persisted using [git lfs](https://git-lfs.com) to ensure compatibility across dev environments. 


### B. functions

The functions folder contains the code of the function in [`index.js`](functions/index.js). Helper methods are included under the [lib folder](functions/lib/): 

        lib
        ├── templating.js
        ├── typedef.js
        └── utils.js

This directory will also contain the local `tectonic` node module `.targz` when the `rebuild` command is run. 

To run the nodemailer function, a `.env` file is also required, as denoted [here](#a-environment). 

### C. dir

This contains exported data from local emulators. This allows for data to be easily re-persisted across emulator runs (and prevents us from having to re-enter data every time). Run `npm run local` or `firebase emulators:start --import=./dir`.


## III. Development

### A. Environment

Using nodemailer requires a `.env` file in the `functions/` directory to prevent doxing of email and password. 

First, provide a Gmail account:
```dosini
USER_EMAIL="AveryInterestingEmail@gmail.com
```

However, to use nodemailer, we need to setup 2FA and then create an app-specific password for this account, as detailed [here](https://nodemailer.com/usage/using-gmail/), in the nodemailer documentation, and [here](https://support.google.com/accounts/answer/185833?hl=en) in the Google docs. 

Finally, we can add that password as well:
```dosini
USER_PASS="1234 5645 8976 0000"
```

There is no need to use the `dotenv` node package as Firebase handles environment variables automatically.

### B. Local

To run this application locally, first run `npm run rebuild:tectonic` if having cloned the git repository for the first time or `npm run install:tectonic` if needing to re-install for any reason. Then, run `npm run local`. 

### C. Cloud

To maintain the correct version of Tectonic integrity check in `functions/package-lock.json`, run `npm run rebuild:tectonic` or `npm run install:tectonic` in the root directory. Then run `npm run cloud` or `firebase deploy --only functions` from the root directory. 

## IV. Future
There are many paths to improve this package as it is used in a production, corporate environment. We have listed a few paths here:
1. Compilers: If the Tectonic package is not ideal in the future for any number of reasons, there are other LaTeX compilers that may be of interest, the biggest of which would be `pdflatex`, `lualatex`, or `xelatex`. However, these compilers require a LaTeX environment, which requires installation of BasicTeX or the complete LaTeX installation. This, for simple reasons, is incompatible with the NPM module strategy employed here. So, in order to enable usage of these compilers, we recommend the use of Google Cloud Run to create a Docker container that will install this environment. 
2. String Templating: Due to the inherent qualities of the Javascript engine and its memory handling, scaling up string operations is a very costly endeavor. If, at any point, the amount of items to be interpolated into the template reaches a critical mass (we estimate in the thousands), then using a "native" NodeJS module written in C++ or Rust to handle templating may be more ideal.
