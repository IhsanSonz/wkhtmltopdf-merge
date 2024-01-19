import express from 'express';
import wkhtmltopdf from 'wkhtmltopdf';
import { PDFDocument } from 'pdf-lib';
import fs, { promises } from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function mergePDFs(pdfPaths, outputPath) {
  const mergedPdf = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    const pdfBytes = await promises.readFile(pdfPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => {
      mergedPdf.addPage(page);
    });
  }

  const mergedPdfBytes = await mergedPdf.save();

  await promises.writeFile(outputPath, mergedPdfBytes);
}

function exportHtml(url, file, options) {
  return new Promise((resolve, reject) => {
    wkhtmltopdf(url, options, (err, stream) => {
      if (err) {
        reject(err);
      } else {
        stream.pipe(fs.createWriteStream(file));
        resolve(true);
      }
    });
  });
}

function createDirectoryRecursive(directoryPath) {
  const parts = directoryPath.split(path.sep);

  for (let i = 1; i <= parts.length; i++) {
    const currentPath = path.join(...parts.slice(0, i));

    if (!fs.existsSync(currentPath)) {
      fs.mkdirSync(currentPath);
    }
  }
}

const app = express();

app.get('/', function (req, res) {
  return res.json({
    message: 'OK',
    success: true,
  })
});

app.get('/topdf', async function (req, res) {
  let d = new Date();
  let timestamp = d.toISOString();
  let response;

  try {
    const dpi = 270;
    let options = { dpi, pageSize: 'A4', printMediaType: true, ...req.query?.options };

    const pdfs = req.query.pdf;
    if (!pdfs) throw new Error('No PDF link provided!');

    const pdfDir = req.query.pdfDir;
    if (!pdfDir) throw new Error('No PDF Directory provided!');

    if (!fs.existsSync(pdfDir)) {
      createDirectoryRecursive(pdfDir);
    }

    let pdfPaths = [];
    await Promise.all(pdfs.map(async (pdf, i) => {
      let pdfPath = pdfDir + timestamp + '_index_' + i + '.pdf';
      let pdfLink = decodeURIComponent(pdf);
      let pdfOK = await exportHtml(
        pdfLink,
        pdfPath,
        options,
      );
      if (pdfOK) pdfPaths.push(pdfPath);
    }));

    const outputPath = pdfDir + timestamp + '_merged.pdf';

    if (pdfPaths.length === 1) {
      fs.renameSync(pdfPaths[0], outputPath);
    } else {
      mergePDFs(pdfPaths, outputPath)
        .then(() => {
          pdfPaths.forEach((pdf) => fs.unlinkSync(pdf));
        })
    }
    response = {
      message: 'PDFs merged successfully!',
      success: true,
    }
  } catch (error) {
    console.error(error);
    response = {
      message: error.toString() || 'something wrong while processing the PDF',
      success: false,
    }
  }

  return res.json(response);

});

app.listen(process.env.PORT);