// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAtWEQg257t76ebNJiT4oDbnyHecIeyMxk",
  authDomain: "csc131-project-5b513.firebaseapp.com",
  projectId: "csc131-project-5b513",
  storageBucket: "csc131-project-5b513.appspot.com",
  messagingSenderId: "1035380002123",
  appId: "1:1035380002123:web:5f6d7c107326ec919bacce",
  measurementId: "G-4TSHE5X616"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();
// Function to fetch data
const fetchData = async () => {
  console.log("Fetching data...");
  try {
    const docRef = db.collection("Invoice").doc("test1234");
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      const data = docSnap.data();
      const processedData = {};
      
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          // Check if the array contains objects
          if (value.length > 0 && typeof value[0] === 'object') {
            processedData[key] = value.map(obj => JSON.stringify(obj));
          } else {
            processedData[key] = value.join(", ");
          }
        } else if (value instanceof firebase.firestore.Timestamp) {
          processedData[key] = value.toDate().toLocaleString();
        } else {
          processedData[key] = value;
        }
      }
      
      document.getElementById("someElement").innerText = JSON.stringify(processedData);
      console.log("Document found:", processedData);
    } else {
      console.log("No such document!");
      document.getElementById("someElement").innerText = "No such document!";
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    document.getElementById("someElement").innerText = "Error fetching data.";
  }
};


// Fetch data 
fetchData();

const generatePDF = () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Fetch the data from the element (assuming it's already populated)
  const dataString = document.getElementById("someElement").innerText;
  const data = JSON.parse(dataString);

  // Define the order in which keys should appear
  const keyOrder = [
    "clientName", "clientPO", "dueDate", "invoiceDate", "invoiceNumber",
    "items", "paymentTerms", "reference", "runPDF"
  ];

  // Write the data to the PDF
  let y = 10;  // Y-position for text
  for (const key of keyOrder) {
    const value = data[key];
    doc.text(`${key}: ${value}`, 10, y);
    y += 10;  // Move down the Y-axis for the next line
  }
  
  // Add footer with current time
  const currentTime = new Date().toLocaleString();
  doc.text(`Invoice generated on ${currentTime}`, 10, 280);  // 280 is near the bottom of the page
  
  // Save the PDF
  doc.save('FirestoreData.pdf');
};
