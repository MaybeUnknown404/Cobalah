const puppeteer = require('puppeteer');
const fs = require('fs');

// =================================================================
// == EDIT BAGIAN INI ==
// Ganti dengan URL kategori, genre, atau tahun yang Anda inginkan.
// =================================================================
const categoryUrl = "https://new19.ngefilm.site/year/2025/";
// =================================================================

async function scrapeMovies() {
  console.log("Memulai proses scraping...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  // --- TAHAP 1: PENEMUAN (DISCOVERY) ---
  console.log(`Mengambil daftar film dari: ${categoryUrl}`);
  const page = await browser.newPage();
  await page.goto(categoryUrl, { waitUntil: 'domcontentloaded' });

  // Ambil semua link film dari halaman kategori
  // SELEKTOR INI MUNGKIN PERLU ANDA UBAH JIKA STRUKTUR SITUS BERUBAH
  const discoveredMovies = await page.evaluate(() => {
    const movieElements = document.querySelectorAll('article.item a.gmr-watch-button'); // Mengambil dari tombol "Tonton"
    const movies = [];
    movieElements.forEach(el => {
      const title = el.closest('.item-article').querySelector('h2.entry-title a')?.textContent.trim() || 'Judul Tidak Diketahui';
      const url = el.getAttribute('href');
      if(title && url) {
        movies.push({ title, url });
      }
    });
    return movies;
  });

  await page.close();

  if (discoveredMovies.length === 0) {
    console.log("Tidak ada film yang ditemukan di halaman kategori. Periksa kembali CSS Selector Anda.");
    await browser.close();
    return [];
  }
  
  console.log(`Ditemukan ${discoveredMovies.length} film. Memulai tahap ekstraksi...`);
  
  // --- TAHAP 2: EKSTRAKSI (EXTRACTION) ---
  const results = [];
  for (const movie of discoveredMovies) {
    try {
      console.log(`Memproses: ${movie.title}`);
      const moviePage = await browser.newPage();
      
      let m3u8Link = null;

      await moviePage.setRequestInterception(true);
      moviePage.on('request', (request) => {
        if (request.url().includes('.m3u8') && !m3u8Link) {
          console.log(`--> Link .m3u8 terdeteksi: ${request.url()}`);
          m3u8Link = request.url();
        }
        request.continue();
      });

      await moviePage.goto(movie.url, { waitUntil: 'domcontentloaded' });
      
      const posterUrl = await moviePage.evaluate(() => {
        const meta = document.querySelector('meta[property="og:image"]');
        return meta ? meta.getAttribute('content') : '';
      });
      
      const playButtonSelector = 'button#timeloading';
      await moviePage.waitForSelector(playButtonSelector, { timeout: 10000 });
      await moviePage.click(playButtonSelector);
      
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      if (m3u8Link) {
        results.push({
          title: movie.title,
          poster: posterUrl,
          m3u8: m3u8Link,
        });
        console.log(`--> SUKSES: ${movie.title}`);
      } else {
        console.log(`--> GAGAL: Tidak dapat menemukan link .m3u8 untuk ${movie.title}`);
      }

      await moviePage.close();

    } catch (error) {
      console.error(`Error saat memproses ${movie.title}: ${error.message}`);
    }
  }

  await browser.close();
  return results;
}

function generateM3U(scrapedData) {
  let m3uContent = "#EXTM3U\n";
  for (const item of scrapedData) {
    m3uContent += `#EXTINF:-1 tvg-logo="${item.poster}",${item.title}\n`;
    m3uContent += `${item.m3u8}\n`;
  }
  return m3uContent;
}

scrapeMovies().then(data => {
  if (data.length > 0) {
    const m3uPlaylist = generateM3U(data);
    fs.writeFileSync('playlist.m3u', m3uPlaylist, 'utf8');
    console.log(`File playlist.m3u berhasil dibuat/diperbarui dengan ${data.length} entri.`);
  } else {
    console.log("Tidak ada data yang berhasil diambil, file playlist tidak diperbarui.");
  }
}).catch(err => {
  console.error("Terjadi error fatal:", err);
});￼Enter
