const puppeteer = require('puppeteer');
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');

const sitemaps = [
  'https://example.com/sitemap1.xml',
  // any other sitemaps
];

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const brokenImagesLog = [];

  async function getLinksFromSitemap(sitemapUrl) {
    try {
      const response = await axios.get(sitemapUrl);
      const result = await xml2js.parseStringPromise(response.data);
      return result.urlset.url.map((urlObj) => urlObj.loc[0]);
    } catch (error) {
      console.error(`Error fetching or parsing sitemap ${sitemapUrl}:`, error);
      return [];
    }
  }

  async function scrollToBottom(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 200;
        const delay = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, delay);
      });
    });
  }

  async function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }

  async function checkPageImages(pageUrl) {
    console.log(`Checking page: ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'networkidle2' });

    await scrollToBottom(page);
    // Wait for additional content to load, if any
    await delay(2000);

    const brokenImages = await page.evaluate(() => {
      const images = Array.from(document.images);
      const broken = images.filter(img => !img.complete || img.naturalWidth === 0);
      
      // Lazy-loaded images handling
      const lazyImages = document.querySelectorAll('[data-src], [data-srcset]');
      lazyImages.forEach(img => {
        img.src = img.dataset.src || img.src;
        img.srcset = img.dataset.srcset || img.srcset;
      });

      return broken.map(img => img.src);
    });

    if (brokenImages.length > 0) {
      console.log(`Broken images found on ${pageUrl}:`, brokenImages);
      brokenImagesLog.push({ pageUrl, brokenImages });
    } else {
      console.log(`No broken images on ${pageUrl}`);
    }
  }

  for (const sitemap of sitemaps) {
    const links = await getLinksFromSitemap(sitemap);
    for (const link of links) {
      await checkPageImages(link);
    }
  }

  // Write the broken images log to a JSON file
  fs.writeFileSync('./broken_images_log.json', JSON.stringify(brokenImagesLog, null, 2));
  
  await browser.close();
})();
