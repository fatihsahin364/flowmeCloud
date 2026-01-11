import { Button } from '@forge/ui';

// Function to handle the upload button click
async function handleUploadClick() {
  const pageId = 'YOUR_PAGE_ID'; // Replace with your actual page ID
  const fileName = 'diagram.svg'; // The name of the file you want to upload
  const fileContent = 'YOUR_SVG_CONTENT'; // The content of your SVG file as a string

  try {
      const uploadResponse = await uploadAttachment(pageId, fileName, fileContent, 'user');
      console.log('Upload successful:', uploadResponse);
  } catch (error) {
      console.error('Error uploading attachment:', error);
  }
}

// Inside your macro component render method
<Button text="Upload SVG" onClick={handleUploadClick} />
