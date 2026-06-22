// Inyectar interfaz de usuaio a la pagina
function injectUI() {
    if (document.getElementById('manga-downloader-ui')) return;

    const container = document.createElement('div');
    container.id = 'manga-downloader-ui';

    const title = document.createElement('span');
    title.innerText = '💾 Descargar Capítulo';
    title.style.color = 'white';
    title.style.marginBottom = '8px';
    title.style.fontSize = '14px';

    const btnPDF = createButton('PDF', () => processDownload('pdf'));
    const btnZIP = createButton('Imágenes (ZIP)', () => processDownload('zip'));
    const btnCBZ = createButton('Comic (CBZ)', () => processDownload('cbz'));

    container.append(title, btnPDF, btnZIP, btnCBZ);
    document.body.appendChild(container);
}

function createButton(text, onClick) {
    const btn = document.createElement('button');
    btn.className = 'md-btn';
    btn.innerText = text;
    btn.addEventListener('click', onClick);
    return btn;
}

// Extraer URLs
function getImages() {
    const pages = document.querySelectorAll('div[data-page]');
    const totalPages = pages.length;

    const firstImg = document.querySelector('img.reader-image');
    if (!firstImg || totalPages === 0) return [];

    const firstSrc = firstImg.getAttribute('src'); 
    
    const match = firstSrc.match(/(.*\/)(\d+)(\.[a-zA-Z0-9]+)$/);
    if (!match) return [];

    const basePath = match[1];      
    const padLength = match[2].length; 
    const extension = match[3];     

    const urls = [];
    for (let i = 1; i <= totalPages; i++) {
        const pageNum = String(i).padStart(padLength, '0');
        const fullUrl = new URL(basePath + pageNum + extension, window.location.origin).href;
        urls.push(fullUrl);
    }
    return urls;
}

// Descargar imagen como ArrayBuffer
async function fetchImageBuffer(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.arrayBuffer();
    } catch (e) {
        console.error(`Error descargando ${url}:`, e);
        return null;
    }
}

// Convertir Buffer a JPEG para PDF
function bufferToJpegDataUrl(buffer, mimeType = 'image/webp') {
    return new Promise((resolve, reject) => {
        // Reconstruimos el Blob
        const blob = new Blob([buffer], { type: mimeType });
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', 0.95)); 
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Error procesando imagen para PDF"));
        };
        img.src = url;
    });
}

//arrayBuffer a base64 para mejor compatibilidad y menos errores de permisos en conversión zip
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function getCleanFileName() {
    let title = document.title || 'Capitulo';
    title = title.split('|')[0].trim(); 
    return title.replace(/[^a-z0-9]/gi, '_').toLowerCase(); 
}

// Lógica de descarga adaptada
async function processDownload(format) {
    const urls = getImages();
    if (urls.length === 0) {
        alert("No se pudo detectar el formato de las imágenes. Espera a que cargue la primera página.");
        return;
    }

    const originalTexts = Array.from(document.querySelectorAll('.md-btn')).map(b => b.innerText);
    document.querySelectorAll('.md-btn').forEach(b => b.innerText = "Procesando...");

    const fileName = getCleanFileName();

    try {
        if (format === 'zip' || format === 'cbz') {
            const zip = new JSZip();
            
            for (let i = 0; i < urls.length; i++) {
                const buffer = await fetchImageBuffer(urls[i]);
                if (buffer) {
                    const ext = urls[i].split('.').pop() || 'webp';
                    const name = `${String(i + 1).padStart(3, '0')}.${ext}`;
                    
                    // Convertimos a Base64 y le avisamos a JSZip con { base64: true }
                    const base64Data = arrayBufferToBase64(buffer);
                    zip.file(name, base64Data, { base64: true }); 
                }
            }
            
            const content = await zip.generateAsync({ type: 'blob' });
            triggerDownload(content, `${fileName}.${format}`);
            
        } else if (format === 'pdf') {
            // Buscamos jsPDF en el scope global de la extensión
            const PDFClass = globalThis.jspdf ? globalThis.jspdf.jsPDF : (window.jspdf ? window.jspdf.jsPDF : window.jsPDF);
            
            if (!PDFClass) throw new Error("No se pudo encontrar la librería jsPDF");
            
            const pdf = new PDFClass();
            
            for (let i = 0; i < urls.length; i++) {
                const buffer = await fetchImageBuffer(urls[i]);
                if (buffer) {
                    const jpegDataUrl = await bufferToJpegDataUrl(buffer);
                    if (i > 0) pdf.addPage();
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    pdf.addImage(jpegDataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
                }
            }
            pdf.save(`${fileName}.pdf`);
        }
    } catch (err) {
        alert("Ocurrió un error. Revisa la consola (F12). Error: " + err.message);
        console.error(err);
    } finally {
        const buttons = document.querySelectorAll('.md-btn');
        buttons.forEach((b, i) => b.innerText = originalTexts[i]);
    }
}

// Descargar
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

setTimeout(injectUI, 1000);