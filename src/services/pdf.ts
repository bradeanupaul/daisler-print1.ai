import { PDFDocument, rgb, cmyk, StandardFonts } from 'pdf-lib';

export async function generateImpositionPDF(
  imageBuffer: ArrayBuffer,
  itemWidthMm: number,
  itemHeightMm: number,
  sheetWidthMm: number,
  sheetHeightMm: number,
  rows: number,
  cols: number,
  spacingMm: number,
  bleedMm: number,
  dpi: number,
  showCropMarks: boolean = false,
  pageIndex: number = 0
) {
  const pdfDoc = await PDFDocument.create();
  const uint8Array = new Uint8Array(imageBuffer);
  
  const mmToPoints = (mm: number) => (mm / 25.4) * 72;
  const pageWidth = mmToPoints(sheetWidthMm);
  const pageHeight = mmToPoints(sheetHeightMm);
  
  const isPng = uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47;
  const isJpg = uint8Array[0] === 0xFF && uint8Array[1] === 0xD8;
  const isPdf = uint8Array[0] === 0x25 && uint8Array[1] === 0x50 && uint8Array[2] === 0x44 && uint8Array[3] === 0x46;

  let embeddedItem: any;
  let isVector = false;

  if (isPdf) {
    const externalPdf = await PDFDocument.load(uint8Array);
    const page = externalPdf.getPage(pageIndex);
    embeddedItem = await pdfDoc.embedPage(page);
    isVector = true;
  } else if (isPng) {
    embeddedItem = await pdfDoc.embedPng(uint8Array);
  } else if (isJpg) {
    embeddedItem = await pdfDoc.embedJpg(uint8Array);
  }

  if (!embeddedItem) return null;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  
  const itemW = mmToPoints(itemWidthMm);
  const itemH = mmToPoints(itemHeightMm);
  const spacing = mmToPoints(spacingMm);
  
  // Total grid dimensions
  const gridW = cols * itemW + (cols - 1) * spacing;
  const gridH = rows * itemH + (rows - 1) * spacing;
  
  // Center grid on sheet
  const startX = (pageWidth - gridW) / 2;
  const startY = (pageHeight - gridH) / 2;

  const color = rgb(0, 0, 0);
  const thick = 0.3;
  const markLen = mmToPoints(4);
  const markOff = mmToPoints(1);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (itemW + spacing);
      const y = startY + r * (itemH + spacing);

      const itemDims = isVector ? { width: (embeddedItem as any).width, height: (embeddedItem as any).height } : (embeddedItem as any).scale(1);
      const itemRatio = itemDims.width / itemDims.height;
      const targetRatio = itemW / itemH;

      let drawW = itemW;
      let drawH = itemH;
      let offX = 0;
      let offY = 0;

      if (itemRatio > targetRatio) {
        // Wider than target
        drawW = itemW;
        drawH = itemW / itemRatio;
        offY = (itemH - drawH) / 2;
      } else {
        // Taller than target
        drawH = itemH;
        drawW = itemH * itemRatio;
        offX = (itemW - drawW) / 2;
      }

      const drawOptions = {
        x: x + offX,
        y: y + offY,
        width: drawW,
        height: drawH,
      };

      if (isVector) {
        page.drawPage(embeddedItem, drawOptions);
      } else {
        page.drawImage(embeddedItem, drawOptions);
      }

      if (showCropMarks) {
        // Draw individual crop marks for each item (Double line requirement)
        // Horizontal (Top/Bottom)
        [y, y + itemH].forEach(yPos => {
          page.drawLine({ start: { x: x - markOff, y: yPos }, end: { x: x - markOff - markLen, y: yPos }, color, thickness: thick });
          page.drawLine({ start: { x: x + itemW + markOff, y: yPos }, end: { x: x + itemW + markOff + markLen, y: yPos }, color, thickness: thick });
        });
        
        // Vertical (Left/Right)
        [x, x + itemW].forEach(xPos => {
          page.drawLine({ start: { x: xPos, y: y - markOff }, end: { x: xPos, y: y - markOff - markLen }, color, thickness: thick });
          page.drawLine({ start: { x: xPos, y: y + itemH + markOff }, end: { x: xPos, y: y + itemH + markOff + markLen }, color, thickness: thick });
        });
      }
    }
  }

  return await pdfDoc.save();
}

export async function generatePrintPDF(
  imageBuffers: ArrayBuffer[],
  widthMm: number,
  heightMm: number,
  bleedMm: number,
  safeMarginMm: number,
  dpi: number,
  addCutLine: boolean,
  addSafeZone: boolean,
  cutLineColor: string,
  showCropMarks: boolean = false,
  pageIndex: number | 'all' = 'all'
) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  // Convert mm to points (1 inch = 72 points, 1 inch = 25.4 mm)
  const mmToPoints = (mm: number) => (mm / 25.4) * 72;
  
  const drawRect = (page: any, x: number, y: number, width: number, height: number, color: any, thickness: number, dashed: boolean = false) => {
    const options = {
      x,
      y,
      width,
      height,
      borderColor: color,
      borderWidth: thickness,
    };
    
    if (dashed) {
      const dash = 2;
      page.drawLine({ start: { x, y: y + height }, end: { x: x + width, y: y + height }, color, thickness, dashArray: [dash, dash] });
      page.drawLine({ start: { x, y }, end: { x: x + width, y }, color, thickness, dashArray: [dash, dash] });
      page.drawLine({ start: { x, y }, end: { x, y: y + height }, color, thickness, dashArray: [dash, dash] });
      page.drawLine({ start: { x: x + width, y }, end: { x: x + width, y: y + height }, color, thickness, dashArray: [dash, dash] });
    } else {
      page.drawRectangle({
        ...options,
        color: undefined, // Transparent fill
      });
    }
  };

  const pageWidth = mmToPoints(widthMm + 2 * bleedMm);
  const pageHeight = mmToPoints(heightMm + 2 * bleedMm);
  
  for (const buffer of imageBuffers) {
    let image;
    const uint8Array = new Uint8Array(buffer);
    
    const isPng = uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47;
    const isJpg = uint8Array[0] === 0xFF && uint8Array[1] === 0xD8;
    const isPdf = uint8Array[0] === 0x25 && uint8Array[1] === 0x50 && uint8Array[2] === 0x44 && uint8Array[3] === 0x46;
    const isSvg = uint8Array[0] === 0x3C && uint8Array[1] === 0x73 && uint8Array[2] === 0x76 && uint8Array[3] === 0x67;
    
    try {
      if (isPdf) {
        try {
          const externalPdf = await PDFDocument.load(uint8Array);
          const indices = pageIndex === 'all' 
            ? externalPdf.getPageIndices() 
            : [pageIndex];
          
          // Filter valid indices
          const validIndices = indices.filter(i => i >= 0 && i < externalPdf.getPageCount());
          
          const pages = await pdfDoc.copyPages(externalPdf, validIndices);
          
          for (const externalPage of pages) {
            const page = pdfDoc.addPage([pageWidth, pageHeight]);
            const embeddedPage = await pdfDoc.embedPage(externalPage);
            
            // Calculate proportional dimensions for the PDF page to avoid distortion
            const pageDims = embeddedPage.scale(1);
            const pageRatio = pageDims.width / pageDims.height;
            const targetW = mmToPoints(widthMm);
            const targetH = mmToPoints(heightMm);
            const targetRatio = targetW / targetH;

            let drawW = targetW;
            let drawH = targetH;
            let offX = 0;
            let offY = 0;

            if (pageRatio > targetRatio) {
              drawW = targetH * pageRatio;
              offX = -(drawW - targetW) / 2;
            } else {
              drawH = targetW / pageRatio;
              offY = -(drawH - targetH) / 2;
            }

            page.drawPage(embeddedPage, {
              x: mmToPoints(bleedMm) + offX,
              y: mmToPoints(bleedMm) + offY,
              width: drawW,
              height: drawH,
            });

            if (addCutLine) {
              // Standard CutContour Spot Color (usually 100% Magenta in preview, but name is crucial)
              // For RIP compatibility, we use CMYK Magenta (0, 100, 0, 0) 
              // and a distinctive name that RIPs look for.
              const color = cmyk(0, 1, 0, 0); 
              drawRect(page, mmToPoints(bleedMm), mmToPoints(bleedMm), mmToPoints(widthMm), mmToPoints(heightMm), color, 0.5, false);
            }
          }
          continue;
        } catch (pdfErr) {
          console.error("PDF load failed, falling back to raster:", pdfErr);
          throw new Error(`PDF load failed: ${pdfErr instanceof Error ? pdfErr.message : 'Unknown error'}`);
        }
      }

      if (isPng) {
        image = await pdfDoc.embedPng(uint8Array);
      } else if (isJpg) {
        image = await pdfDoc.embedJpg(uint8Array);
      } else {
        try {
          image = await pdfDoc.embedPng(uint8Array);
        } catch (pngErr) {
          image = await pdfDoc.embedJpg(uint8Array);
        }
      }
    } catch (err) {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawText(`Failed to embed image: ${err instanceof Error ? err.message : 'Unknown error'}`, {
        x: 50,
        y: pageHeight / 2,
        size: 12,
        font,
        color: rgb(1, 0, 0),
      });
      continue;
    }
    
    if (!image) continue;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    
    // Draw white background
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(1, 1, 1),
    });
    
    // Calculate proportional dimensions for the PDF page to fill the entire area (including bleed)
    // We use 'cover' logic here because the AI has already provided the extension/bleed. 
    // This eliminates any tiny white gaps that 'contain' might leave due to pixel rounding.
    const imgDims = image.scale(1);
    const imgRatio = imgDims.width / imgDims.height;
    const targetW = mmToPoints(widthMm + 2 * bleedMm);
    const targetH = mmToPoints(heightMm + 2 * bleedMm);
    const targetRatio = targetW / targetH;

    let drawW = targetW;
    let drawH = targetH;
    let offX = 0;
    let offY = 0;

    if (imgRatio > targetRatio) {
      // Image is wider than target area (relative) -> Scale by height, center horizontally (crops sides of expansion)
      drawW = targetH * imgRatio;
      offX = -(drawW - targetW) / 2;
    } else {
      // Image is taller than target area (relative) -> Scale by width, center vertically (crops top/bottom of expansion)
      drawH = targetW / imgRatio;
      offY = -(drawH - targetH) / 2;
    }

    // Draw image centered and scaled to FILL (Eliminates white gaps)
    page.drawImage(image, {
      x: offX,
      y: offY,
      width: drawW,
      height: drawH,
    });

    if (showCropMarks) {
      const markLength = mmToPoints(5);
      const markOffset = mmToPoints(2);
      const color = rgb(0, 0, 0);
      const thickness = 0.5;

      const bleedPts = mmToPoints(bleedMm);
      const widthPts = mmToPoints(widthMm);
      const heightPts = mmToPoints(heightMm);

      // Top Left
      page.drawLine({ start: { x: bleedPts, y: pageHeight - markOffset }, end: { x: bleedPts, y: pageHeight - markOffset - markLength }, color, thickness });
      page.drawLine({ start: { x: markOffset, y: pageHeight - bleedPts }, end: { x: markOffset + markLength, y: pageHeight - bleedPts }, color, thickness });

      // Top Right
      page.drawLine({ start: { x: pageWidth - bleedPts, y: pageHeight - markOffset }, end: { x: pageWidth - bleedPts, y: pageHeight - markOffset - markLength }, color, thickness });
      page.drawLine({ start: { x: pageWidth - markOffset, y: pageHeight - bleedPts }, end: { x: pageWidth - markOffset - markLength, y: pageHeight - bleedPts }, color, thickness });

      // Bottom Left
      page.drawLine({ start: { x: bleedPts, y: markOffset }, end: { x: bleedPts, y: markOffset + markLength }, color, thickness });
      page.drawLine({ start: { x: markOffset, y: bleedPts }, end: { x: markOffset + markLength, y: bleedPts }, color, thickness });

      // Bottom Right
      page.drawLine({ start: { x: pageWidth - bleedPts, y: markOffset }, end: { x: pageWidth - bleedPts, y: markOffset + markLength }, color, thickness });
      page.drawLine({ start: { x: pageWidth - markOffset, y: bleedPts }, end: { x: pageWidth - markOffset - markLength, y: bleedPts }, color, thickness });
    }
    
    if (addCutLine) {
      // Use CMYK Magenta (0, 100, 0, 0) as typical for CutContour
      const color = cmyk(0, 1, 0, 0); 
      drawRect(page, mmToPoints(bleedMm), mmToPoints(bleedMm), mmToPoints(widthMm), mmToPoints(heightMm), color, 0.5, false);
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
