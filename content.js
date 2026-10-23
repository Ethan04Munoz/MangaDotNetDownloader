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

// Detectar el sitio actual
function getCurrentSite() {
    const host = window.location.hostname;
    if (host.includes('hentaifox.com')) return 'hentaifox';
    if (host.includes('nhentai.')) return 'nhentai';
    return 'mangadot';
}

const SITE = getCurrentSite();

// Saber si la pagina actual es un lector (evita inyectar UI en busquedas, galerias, etc.)
function isReaderPage() {
    if (SITE === 'mangadot') {
        return document.querySelector('img.reader-image, div[data-page]') !== null;
    }
    // hentaifox y nhentai usan los mismos inputs ocultos en su lector
    return document.querySelector('#pages') && document.querySelector('#image_dir') && document.querySelector('#gallery_id');
}

// Extraer URLs
function getImages() {
    if (SITE === 'hentaifox' || SITE === 'nhentai') return getGalleryImages();
    return getMangadotImages();
}

// hentaifox / nhentai: ambas construyen la URL a partir de inputs ocultos del lector
function getGalleryImages() {
    const pagesInput = document.querySelector('#pages');
    const dirInput = document.querySelector('#image_dir');
    const galleryInput = document.querySelector('#gallery_id');
    if (!pagesInput || !dirInput || !galleryInput) return [];

    const totalPages = parseInt(pagesInput.value, 10);
    if (!totalPages) return [];

    let base;
    if (SITE === 'hentaifox') {
        base = `https://i.hentaifox.com/${dirInput.value}/${galleryInput.value}/`;
    } else {
        const serverId = (document.querySelector('#server_id') || {}).value || '5';
        base = `https://i${serverId}.nhentaimg.com/${dirInput.value}/${galleryInput.value}/`;
    }

    // La extension varia por pagina (webp/jpg), se lee del objeto g_th del sitio
    const extensions = getExtensionMap();
    const defaultExt = SITE === 'nhentai' ? 'webp' : 'jpg';

    const urls = [];
    for (let i = 1; i <= totalPages; i++) {
        const ext = extensions[i] || defaultExt;
        urls.push(`${base}${i}.${ext}`);
    }
    return urls;
}

// Lee el JSON g_th que ambos sitios definen en un script inline.
// Formato: {"1":"j,1280,1837"} o {"fl":{...},"th":{...}} (nhentai)
// j = jpg, w = webp, p = png
function getExtensionMap() {
    const extMap = {};
    for (const script of document.querySelectorAll('script')) {
        const text = script.textContent || '';
        if (!text.includes('g_th')) continue;

        const match = text.match(/parseJSON\('(.+?)'\)/);
        if (!match) return fallbackExtensionMap();

        try {
            let data = JSON.parse(match[1]);
            if (data.fl && typeof data.fl === 'object') data = data.fl;

            for (const [page, info] of Object.entries(data)) {
                if (!/^\d+$/.test(page)) continue;
                const fmt = info.charAt(0);
                extMap[parseInt(page, 10)] = fmt === 'w' ? 'webp' : fmt === 'p' ? 'png' : 'jpg';
            }
        } catch (e) {
            return fallbackExtensionMap();
        }
        return extMap;
    }
    return fallbackExtensionMap();
}

// Si g_th no existe, deduce la extension desde la imagen visible del lector
function fallbackExtensionMap() {
    const extMap = {};
    const img = document.querySelector('#gimg, #fimg');
    if (img) {
        const match = (img.getAttribute('src') || '').match(/\/(\d+)\.([a-zA-Z0-9]+)$/);
        if (match) extMap[parseInt(match[1], 10)] = match[2];
    }
    return extMap;
}

// mangadot.net
function getMangadotImages() {
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
// Devuelve tambien las dimensiones para que cada pagina del PDF respete el aspecto de su imagen
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
            resolve({
                dataUrl: canvas.toDataURL('image/jpeg', 0.95),
                width: img.width,
                height: img.height
            });
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
    // nhentai: "Titulo - Page 1 » nhentai"
    title = title.replace(/\s*-\s*Page\s*\d+.*$/i, '');
    // hentaifox: "Titulo Page 1"
    title = title.replace(/\s+Page\s*\d+.*$/i, '');
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
            
            // Cada pagina del PDF toma el tamaño exacto de su imagen (en px),
            // asi una portada 16:9 no se estira para caber en un A4 vertical.
            let pdf = null;
            
            for (let i = 0; i < urls.length; i++) {
                const buffer = await fetchImageBuffer(urls[i]);
                if (!buffer) continue;
                
                const { dataUrl, width, height } = await bufferToJpegDataUrl(buffer);
                const orientation = width > height ? 'landscape' : 'portrait';
                
                if (!pdf) {
                    pdf = new PDFClass({ unit: 'px', format: [width, height], orientation });
                } else {
                    pdf.addPage([width, height], orientation);
                }
                pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height);
            }
            
            if (!pdf) throw new Error("No se pudo descargar ninguna imagen para el PDF");
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

if (isReaderPage()) {
    setTimeout(injectUI, 1000);
}