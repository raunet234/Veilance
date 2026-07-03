console.log('Payzee Extension: Content script loaded');

// Use localhost for development, production URL for deployed version
// Set DEV_MODE to true for local development
const DEV_MODE = true;
const DASHBOARD_URL = DEV_MODE ? 'http://localhost:3001' : 'https://payzee-tan.vercel.app';
let cardDetails = null;
let productDetails = null;

// Function to extract merchant data from current page
function extractMerchantData() {
  try {
    const hostname = window.location.hostname;
    const cleanDomain = hostname.replace(/^www\./, '');
    
    // Extract merchant name from page title or meta tags
    let merchantName = document.title.split('|')[0].trim();
    if (merchantName.length > 50) {
      merchantName = cleanDomain.split('.')[0].toUpperCase();
    }
    
    return {
      name: merchantName,
      domain: cleanDomain,
      url: window.location.href
    };
  } catch (error) {
    console.error('Payzee: Error extracting merchant data:', error);
    return {
      name: 'MERCHANT',
      domain: 'unknown.com',
      url: window.location.href
    };
  }
}

// Function to extract product/booking details from page
function extractProductDetails() {
  try {
    const bodyText = document.body.innerText;
    const details = {
      productName: '',
      location: '',
      rating: '',
      checkIn: '',
      checkOut: '',
      duration: '',
      image: '',
      additionalInfo: []
    };
    
    // Try to extract hotel/product name (look for specific classes first)
    const hotelNameElements = document.querySelectorAll('[class*="hotel-name" i], [class*="property-name" i], [class*="propertyname" i]');
    
    for (const element of hotelNameElements) {
      const text = element.textContent.trim();
      if (text.length > 5 && text.length < 100) {
        details.productName = text;
        console.log('Payzee: Found product name from hotel-name class:', text);
        break;
      }
    }
    
    // If not found, look for headings
    if (!details.productName) {
      const headings = document.querySelectorAll('h1, h2, h3, [class*="title" i], [class*="name" i], [class*="hotel" i]');
      for (const heading of headings) {
        const text = heading.textContent.trim();
        const lowerText = text.toLowerCase();
        
        // Skip if contains payment/checkout related terms
        if (lowerText.includes('payment') || 
            lowerText.includes('checkout') || 
            lowerText.includes('refundable') ||
            lowerText.includes('rate') ||
            lowerText.includes('pricing') ||
            lowerText.includes('total') ||
            lowerText.includes('confirm') ||
            lowerText.includes('review') ||
            text.length < 5 || 
            text.length > 100) {
          continue;
        }
        
        // Prefer headings that look like property names
        if ((heading.tagName === 'H1' || heading.tagName === 'H2') ||
            heading.className.toLowerCase().includes('hotel') ||
            heading.className.toLowerCase().includes('property') ||
            heading.className.toLowerCase().includes('name')) {
          details.productName = text;
          console.log('Payzee: Found product name from heading:', text);
          break;
        }
      }
    }
    
    // If still no name, try meta tags
    if (!details.productName) {
      const metaProperty = document.querySelector('meta[property="og:title"]');
      if (metaProperty) {
        const title = metaProperty.content.split('|')[0].trim();
        if (title.length > 5 && title.length < 100) {
          details.productName = title;
          console.log('Payzee: Found product name from meta:', title);
        }
      }
    }
    
    // Extract main product image
    // First check for background images in elements (common in carousels)
    const elementsWithBg = document.querySelectorAll('[style*="background-image"], [class*="carousel" i], [class*="slider" i], [class*="hero" i]');
    console.log('Payzee: Found', elementsWithBg.length, 'elements with potential background images');
    
    for (const element of elementsWithBg) {
      const style = window.getComputedStyle(element);
      const bgImage = style.backgroundImage;
      
      if (bgImage && bgImage !== 'none') {
        // Extract URL from background-image: url('...')
        const urlMatch = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
        if (urlMatch && urlMatch[1]) {
          const imageUrl = urlMatch[1];
          console.log('Payzee: Found background image:', imageUrl.substring(0, 80));
          
          // Check if it's a valid image URL
          if (!imageUrl.toLowerCase().includes('logo') && 
              !imageUrl.toLowerCase().includes('icon') &&
              !imageUrl.toLowerCase().includes('sprite') &&
              (imageUrl.includes('.jpg') || imageUrl.includes('.jpeg') || 
               imageUrl.includes('.png') || imageUrl.includes('.webp'))) {
            details.image = imageUrl;
            console.log('Payzee: ✅ Using background image:', imageUrl);
            break;
          }
        }
      }
    }
    
    // If no background image found, check regular img tags
    if (!details.image) {
      const images = document.querySelectorAll('img[src]');
      console.log('Payzee: Found', images.length, 'images on page');
      
      for (const img of images) {
        // Convert relative URLs to absolute
        const src = img.src; // img.src automatically returns absolute URL
        const alt = img.alt?.toLowerCase() || '';
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        
        console.log('Payzee: Checking image:', {
          src: src.substring(0, 80),
          alt,
          width,
          height,
          className: img.className
        });
        
        // Look for main product/hotel images (avoid icons, logos, etc)
        if (width > 200 && height > 150 && 
            !src.toLowerCase().includes('logo') && 
            !src.toLowerCase().includes('icon') && 
            !src.toLowerCase().includes('avatar') &&
            !src.toLowerCase().includes('sprite') &&
            (alt.includes('hotel') || alt.includes('room') || alt.includes('property') || 
             img.className.toLowerCase().includes('hotel') || 
             img.className.toLowerCase().includes('room') || 
             img.className.toLowerCase().includes('property') || 
             img.className.toLowerCase().includes('main') ||
             width > 400)) {
          details.image = src;
          console.log('Payzee: ✅ Found product image:', src, 'dimensions:', width, 'x', height);
          break;
        }
      }
      
      // If no specific image found, try to get the largest image on page
      if (!details.image) {
        console.log('Payzee: No specific image found, looking for largest...');
        let largestImage = null;
        let maxSize = 0;
        
        for (const img of images) {
          const width = img.naturalWidth || img.width || 0;
          const height = img.naturalHeight || img.height || 0;
          const size = width * height;
          const src = img.src;
          
          if (size > maxSize && width > 250 && height > 150 && 
              !src.toLowerCase().includes('logo') && 
              !src.toLowerCase().includes('icon') &&
              !src.toLowerCase().includes('sprite')) {
            maxSize = size;
            largestImage = src;
            console.log('Payzee: New largest candidate:', src, 'size:', width, 'x', height);
          }
        }
        
        if (largestImage) {
          details.image = largestImage;
          console.log('Payzee: ✅ Using largest image:', largestImage);
        } else {
          console.log('Payzee: ❌ No suitable image found');
        }
      }
    }
    
    // Extract location/address
    const addressPatterns = [
      /([A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]+,?\s*\d{5,})/,
      /([A-Z][a-zA-Z\s]+,\s*United Arab Emirates)/i,
      /([A-Z][a-zA-Z\s]+,\s*[A-Z]{2,}\s*\d{5})/
    ];
    
    for (const pattern of addressPatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        details.location = match[1].trim();
        break;
      }
    }
    
    // Extract rating
    const ratingMatch = bodyText.match(/(\d+\.?\d*)\s*(\/10|Wonderful|Excellent|Very Good|Good)/i);
    if (ratingMatch) {
      details.rating = ratingMatch[0];
    }
    
    // Extract check-in date
    const checkInPatterns = [
      /Check[- ]?in[:\s]+([A-Z][a-z]+,\s*[A-Z][a-z]+\s+\d{1,2},\s*\d{4})/i,
      /Check[- ]?in[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i
    ];
    
    for (const pattern of checkInPatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        details.checkIn = match[1];
        break;
      }
    }
    
    // Extract check-out date
    const checkOutPatterns = [
      /Check[- ]?out[:\s]+([A-Z][a-z]+,\s*[A-Z][a-z]+\s+\d{1,2},\s*\d{4})/i,
      /Check[- ]?out[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i
    ];
    
    for (const pattern of checkOutPatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        details.checkOut = match[1];
        break;
      }
    }
    
    // Extract duration
    const durationMatch = bodyText.match(/(\d+\s+night[s]?,\s+\d+\s+room[s]?)/i);
    if (durationMatch) {
      details.duration = durationMatch[1];
    }
    
    console.log('Payzee: Extracted product details:', details);
    return details;
  } catch (error) {
    console.error('Payzee: Error extracting product details:', error);
    return null;
  }
}

// Currency symbols mapping
const CURRENCY_SYMBOLS = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  'Rs': 'INR',
  'C$': 'CAD',
  'A$': 'AUD',
  'CHF': 'CHF',
  'kr': 'SEK',
  'R$': 'BRL'
};

// Function to detect currency from text
function detectCurrency(text) {
  // Check for currency symbols
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) {
      return code;
    }
  }
  
  // Check for currency codes (USD, EUR, GBP, etc.)
  const codeMatch = text.match(/\b(USD|EUR|GBP|JPY|INR|CAD|AUD|CHF|SEK|BRL)\b/i);
  if (codeMatch) {
    return codeMatch[1].toUpperCase();
  }
  
  // Default to USD
  return 'USD';
}

// Function to extract total amount and currency from checkout page
function extractTotalAmount() {
  try {
    const allText = document.body.innerText;
    
    console.log('=== PAYZEE DEBUG: Starting amount extraction ===');
    console.log('Page text length:', allText.length);
    console.log('Text snippet around "Total":', allText.substring(allText.toLowerCase().indexOf('total') - 50, allText.toLowerCase().indexOf('total') + 200));
    
    // First priority: Look specifically for "Total" with amount (search from end to get last/final total)
    const totalPatterns = [
      /total\s*price[:\s]*(Rs|[$€£¥₹]|C\$|A\$|CHF|kr|R\$)?\s*([0-9,]+\.?[0-9]*)\s*(USD|EUR|GBP|JPY|INR|CAD|AUD|CHF|SEK|BRL)?/gi,
      /total[:\s]+(Rs|[$€£¥₹]|C\$|A\$|CHF|kr|R\$)?\s*([0-9,]+\.?[0-9]*)\s*(USD|EUR|GBP|JPY|INR|CAD|AUD|CHF|SEK|BRL)?/gi,
      /grand[\s-]?total[:\s]+(Rs|[$€£¥₹]|C\$|A\$|CHF|kr|R\$)?\s*([0-9,]+\.?[0-9]*)\s*(USD|EUR|GBP|JPY|INR|CAD|AUD|CHF|SEK|BRL)?/gi,
    ];
    
    // Try total-specific patterns - use matchAll to get all matches, then take the last one
    for (let i = 0; i < totalPatterns.length; i++) {
      const pattern = totalPatterns[i];
      console.log(`Trying pattern ${i + 1}:`, pattern);
      
      const matches = [...allText.matchAll(pattern)];
      console.log(`Found ${matches.length} matches for pattern ${i + 1}`);
      
      if (matches.length > 0) {
        // Log all matches
        matches.forEach((m, idx) => {
          console.log(`  Match ${idx + 1}/${matches.length}:`, {
            fullMatch: m[0],
            symbol: m[1],
            amount: m[2],
            code: m[3]
          });
        });
        
        // Take the LAST match (usually the final total after all additions)
        const match = matches[matches.length - 1];
        console.log('Selected LAST match:', match[0]);
        
        const currencySymbol = match[1] || '';
        const amountStr = match[2];
        const currencyCode = match[3];
        
        console.log('Extracted parts:', { currencySymbol, amountStr, currencyCode });
        
        const amount = parseFloat(amountStr.replace(/,/g, ''));
        if (amount > 0) {
          // Detect currency - prioritize the symbol we extracted
          let currency = currencyCode || detectCurrency(currencySymbol);
          console.log('Currency before Rs check:', currency);
          
          if (!currency || currency === 'USD') {
            // Double-check by looking for Rs in the matched text
            if (currencySymbol.includes('Rs') || currencySymbol === 'Rs' || currencySymbol === '₹') {
              currency = 'INR';
              console.log('Overriding currency to INR based on Rs symbol');
            }
          }
          
          const result = {
            amount: amount,
            currency: currency,
            original: `${currencySymbol}${amountStr} ${currencyCode || ''}`.trim()
          };
          
          console.log('=== EXTRACTION SUCCESS ===');
          console.log('Final result:', result);
          console.log('==============================');
          
          return result;
        }
      }
    }
    
    console.log('No matches in total patterns, trying fallback patterns...');
    
    // Fallback: Look for other payment-related amounts
    const fallbackPatterns = [
      /amount[:\s]+(Rs|[$€£¥₹]|C\$|A\$|CHF|kr|R\$)?\s*([0-9,]+\.?[0-9]*)\s*(USD|EUR|GBP|JPY|INR|CAD|AUD|CHF|SEK|BRL)?/i,
      /pay[:\s]+(Rs|[$€£¥₹]|C\$|A\$|CHF|kr|R\$)?\s*([0-9,]+\.?[0-9]*)\s*(USD|EUR|GBP|JPY|INR|CAD|AUD|CHF|SEK|BRL)?/i,
    ];
    
    for (const pattern of fallbackPatterns) {
      const match = allText.match(pattern);
      if (match) {
        console.log('Fallback pattern matched:', match[0]);
        const currencySymbol = match[1] || '';
        const amountStr = match[2] || match[1];
        const currencyCode = match[3];
        
        const amount = parseFloat(amountStr.replace(/,/g, ''));
        if (amount > 0) {
          let currency = currencyCode || detectCurrency(currencySymbol);
          if (currencySymbol.includes('Rs') || currencySymbol === 'Rs' || currencySymbol === '₹') {
            currency = 'INR';
          }
          
          console.log('Fallback result:', { amount, currency, symbol: currencySymbol });
          
          return {
            amount: amount,
            currency: currency,
            original: `${currencySymbol}${amountStr} ${currencyCode || ''}`.trim()
          };
        }
      }
    }
    
    console.log('No fallback matches, trying DOM elements...');
    
    // Try finding elements with "total" in class/id
    const totalElements = document.querySelectorAll('[class*="total" i], [id*="total" i]');
    console.log('Found elements with "total":', totalElements.length);
    
    for (const el of totalElements) {
      const text = el.textContent;
      const match = text.match(/(Rs|[$€£¥₹]|C\$|A\$|CHF|kr|R\$)?\s*([0-9,]+\.?[0-9]*)\s*(USD|EUR|GBP|JPY|INR|CAD|AUD|CHF|SEK|BRL)?/);
      if (match) {
        console.log('Element match:', { element: el, text: text, match: match[0] });
        const currencySymbol = match[1] || '';
        const amountStr = match[2];
        const currencyCode = match[3];
        const amount = parseFloat(amountStr.replace(/,/g, ''));
        
        if (amount > 0) {
          let currency = currencyCode || detectCurrency(currencySymbol || text);
          if (currencySymbol.includes('Rs') || currencySymbol === 'Rs' || currencySymbol === '₹') {
            currency = 'INR';
          }
          return {
            amount: amount,
            currency: currency,
            original: text.trim()
          };
        }
      }
    }
    
    console.log('=== NO AMOUNT FOUND ===');
    return null;
  } catch (error) {
    console.error('Payzee: Error extracting amount:', error);
    return null;
  }
}

// Convert currency to USD using exchange rate API
async function convertToUSD(amount, fromCurrency) {
  if (fromCurrency === 'USD') {
    return amount;
  }
  
  try {
    // Using exchangerate-api.io (free tier, no API key needed)
    const response = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`);
    const data = await response.json();
    
    if (data.result === 'success' && data.rates && data.rates.USD) {
      const usdRate = data.rates.USD;
      const convertedAmount = amount * usdRate;
      console.log(`Payzee: Converted ${amount} ${fromCurrency} to ${convertedAmount.toFixed(2)} USD`);
      return parseFloat(convertedAmount.toFixed(2));
    }
    
    console.warn('Payzee: Currency conversion failed, using original amount');
    return amount;
  } catch (error) {
    console.error('Payzee: Currency conversion error:', error);
    return amount;
  }
}

// Function to detect if current page is a checkout page
function isCheckoutPage() {
  const url = window.location.href.toLowerCase();
  const bodyText = document.body?.innerText?.toLowerCase() || '';
  
  // Don't show button on our own dashboard
  if (url.includes('localhost:3001') || url.includes(DASHBOARD_URL.toLowerCase())) {
    return false;
  }
  
  // URL patterns
  if (/checkout|payment|cart|order/.test(url)) return true;
  
  // Page content patterns
  if (/card number|credit card|debit card|cvv|cvc|expir/i.test(bodyText)) return true;
  
  // Input field detection
  const inputs = document.querySelectorAll('input');
  for (const input of inputs) {
    const attrs = `${input.name} ${input.id} ${input.placeholder}`.toLowerCase();
    if (/card|cvv|cvc|expir/.test(attrs)) return true;
  }
  
  return false;
}

// Function to create and show the "Pay with Crypto" button
function createPayButton() {
  // Check if button already exists
  if (document.getElementById('stellar-pay-button')) return;
  
  const button = document.createElement('button');
  button.id = 'stellar-pay-button';
  button.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="margin-right: 8px;">
      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2 17L12 22L22 17" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2 12L12 17L22 12" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Pay with Payzee
  `;
  
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 14px 24px;
    background: #080808;
    color: #fff;
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: 100px;
    font-size: 15px;
    font-weight: 600;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 40px rgba(74, 222, 128, 0.1);
    z-index: 999999;
    display: flex;
    align-items: center;
    transition: all 0.3s ease;
    letter-spacing: 0;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 50px rgba(74, 222, 128, 0.15)';
    button.style.borderColor = 'rgba(74, 222, 128, 0.5)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 40px rgba(74, 222, 128, 0.1)';
    button.style.borderColor = 'rgba(74, 222, 128, 0.3)';
  });
  
  button.addEventListener('click', handlePayWithCrypto);
  
  if (document.body) {
    document.body.appendChild(button);
  }
}

// Handle Pay with Crypto button click
async function handlePayWithCrypto() {
  const amountData = extractTotalAmount();
  const merchant = extractMerchantData();
  productDetails = extractProductDetails();
  
  console.log('Payzee: Extracted amount data:', amountData);
  console.log('Payzee: Extracted product details:', productDetails);
  
  if (!amountData) {
    openDashboard(null, null, merchant);
    return;
  }
  
  // Show loading modal
  showLoadingModal('Accepting crypto');
  
  // Convert to USD
  const usdAmount = await convertToUSD(amountData.amount, amountData.currency);
  
  console.log(`Payzee: Converted to USD: $${usdAmount}`);
  
  openDashboard(usdAmount, amountData, merchant);
}

// Open dashboard as a small popup window for wallet connection + card creation
// Wallet extensions can't inject into iframes, so we need a real window
function openDashboard(usdAmount, originalAmount, merchant) {
  // Remove loading modal
  hideLoadingModal();

  // Build dashboard URL with amount and merchant data
  const params = new URLSearchParams();
  if (usdAmount) {
    params.set('amount', usdAmount);
    if (originalAmount && originalAmount.currency !== 'USD') {
      params.set('originalAmount', originalAmount.original);
    }
  }
  params.set('merchant', merchant.name);
  params.set('domain', merchant.domain);
  
  const dashboardUrl = `${DASHBOARD_URL}?${params.toString()}`;

  // Calculate popup position (bottom-right corner of screen)
  const popupWidth = 420;
  const popupHeight = 650;
  const left = window.screen.width - popupWidth - 40;
  const top = window.screen.height - popupHeight - 100;

  // Open as small popup window (wallet extensions CAN inject here)
  dashboardWindow = window.open(
    dashboardUrl,
    'payzee-dashboard',
    `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
  );

  // Hide the pay button while popup is open
  const payBtn = document.getElementById('stellar-pay-button');
  if (payBtn) payBtn.style.display = 'none';

  // Listen for card details from dashboard popup
  window.addEventListener('message', handleDashboardMessage);

  // Poll to detect if popup was closed manually
  const pollTimer = setInterval(() => {
    if (dashboardWindow && dashboardWindow.closed) {
      clearInterval(pollTimer);
      // Re-show the pay button if user closed popup without creating card
      if (!cardDetails) {
        const payBtn = document.getElementById('stellar-pay-button');
        if (payBtn) payBtn.style.display = 'flex';
      }
    }
  }, 500);
}

// Show floating card details panel (fallback when auto-fill can't access fields)
function showCardDetailsPanel(card) {
  // Remove existing panel
  const existing = document.getElementById('payzee-card-panel');
  if (existing) existing.remove();

  const pan = card.pan || '';
  const expMonth = (card.exp_month || '').toString().padStart(2, '0');
  const expYear = (card.exp_year || '').toString();
  const cvv = card.cvv || '';

  const panel = document.createElement('div');
  panel.id = 'payzee-card-panel';
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 360px;
    z-index: 9999999;
    background: #0c0c0c;
    border: 1px solid rgba(74, 222, 128, 0.2);
    border-radius: 16px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6), 0 0 60px rgba(74, 222, 128, 0.08);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    animation: payzee-panel-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  `;

  panel.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);">
      <span style="font-size: 14px; font-weight: 700; color: #fff;">
        Pay<span style="color: #4ade80;">zee</span> — Your Card
      </span>
      <button id="payzee-card-panel-close" style="background: none; border: none; color: #555; font-size: 16px; cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1;">✕</button>
    </div>
    <div style="padding: 18px;">
      <div style="margin-bottom: 14px;">
        <div style="font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">Card Number</div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <code style="flex: 1; padding: 10px 12px; background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-size: 15px; font-family: 'Monaco', 'Courier New', monospace; letter-spacing: 1px;">${pan}</code>
          <button class="payzee-copy-btn" data-copy="${pan}" style="padding: 8px 14px; background: #4ade80; color: #080808; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; min-width: 52px; transition: all 0.2s;">Copy</button>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
        <div>
          <div style="font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">Expiry</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <code style="flex: 1; padding: 10px 12px; background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-size: 15px; font-family: monospace;">${expMonth}/${expYear}</code>
            <button class="payzee-copy-btn" data-copy="${expMonth}/${expYear}" style="padding: 8px 12px; background: #4ade80; color: #080808; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; min-width: 46px; transition: all 0.2s;">Copy</button>
          </div>
        </div>
        <div>
          <div style="font-size: 11px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">CVV</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <code style="flex: 1; padding: 10px 12px; background: #111; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #fff; font-size: 15px; font-family: monospace;">${cvv}</code>
            <button class="payzee-copy-btn" data-copy="${cvv}" style="padding: 8px 12px; background: #4ade80; color: #080808; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; min-width: 46px; transition: all 0.2s;">Copy</button>
          </div>
        </div>
      </div>
      <div style="padding: 10px 12px; background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.12); border-radius: 8px; font-size: 12px; color: #777; line-height: 1.5;">
        💡 Paste these details into the payment form. For cardholder name, use <strong style="color: #ccc;">Payzee User</strong>.
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  // Inject animation styles if not already present
  if (!document.getElementById('payzee-panel-styles')) {
    const style = document.createElement('style');
    style.id = 'payzee-panel-styles';
    style.textContent = `
      @keyframes payzee-panel-in {
        from { opacity: 0; transform: translateY(40px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes payzee-panel-out {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(40px) scale(0.95); }
      }
    `;
    document.head.appendChild(style);
  }

  // Close button
  document.getElementById('payzee-card-panel-close').addEventListener('click', () => {
    panel.style.animation = 'payzee-panel-out 0.25s ease-in forwards';
    setTimeout(() => panel.remove(), 250);
  });

  // Copy buttons with ✓ feedback
  panel.querySelectorAll('.payzee-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy);
      const original = btn.textContent;
      btn.textContent = '✓';
      btn.style.background = '#166534';
      btn.style.color = '#fff';
      setTimeout(() => {
        btn.textContent = original;
        btn.style.background = '#4ade80';
        btn.style.color = '#080808';
      }, 1500);
    });
  });

  // Auto-dismiss after 60 seconds
  setTimeout(() => {
    if (panel.parentNode) {
      panel.style.animation = 'payzee-panel-out 0.25s ease-in forwards';
      setTimeout(() => panel.remove(), 250);
    }
  }, 60000);
}

// Function to auto-fill card details using native setters and events
function autoFillCardDetails(card) {
  console.log('Payzee: Starting autofill with card:', card);
  let filledCount = 0;
  
  // Helper function to set value and trigger events
  function setInputValue(element, value) {
    if (!element) return false;
    
    try {
      // Get the native setter to bypass React/Vue
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      
      // Set the value using native setter
      nativeInputValueSetter.call(element, value);
      
      // Dispatch input event (for React/Vue state updates)
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Dispatch change event (for validation)
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Also dispatch blur for some forms
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      
      console.log(`Payzee: Filled ${element.name || element.id || 'field'} with value`);
      filledCount++;
      return true;
    } catch (error) {
      console.error('Payzee: Error setting input value:', error);
      return false;
    }
  }
  
  // Find card number field
  const cardNumberSelectors = [
    'input[name*="cardnumber" i]',
    'input[name*="card-number" i]',
    'input[name*="card_number" i]',
    'input[name*="ccnumber" i]',
    'input[name*="creditcard" i]',
    'input[id*="cardnumber" i]',
    'input[id*="card-number" i]',
    'input[id*="card_number" i]',
    'input[placeholder*="card number" i]',
    'input[placeholder*="card" i][placeholder*="number" i]',
    'input[autocomplete="cc-number"]',
    'input[data-testid*="card" i]',
    'input[aria-label*="card number" i]',
    'input[type="tel"][name*="card" i]',
    'input[type="text"][name*="card" i]'
  ];
  
  let cardNumberField = null;
  for (const selector of cardNumberSelectors) {
    cardNumberField = document.querySelector(selector);
    if (cardNumberField) {
      console.log('Payzee: Found card number field:', selector);
      break;
    }
  }
  
  if (cardNumberField && card.pan) {
    setInputValue(cardNumberField, card.pan);
  } else {
    console.warn('Payzee: Card number field not found or card.pan missing (likely inside payment iframe)');
  }
  
  // Find expiry field(s)
  const expirySelectors = [
    'input[name*="expiry" i]',
    'input[name*="expiration" i]',
    'input[name*="exp" i]:not([name*="cvv" i]):not([name*="cvc" i])',
    'input[id*="expiry" i]',
    'input[id*="expiration" i]',
    'input[placeholder*="mm" i][placeholder*="yy" i]',
    'input[placeholder*="expir" i]',
    'input[autocomplete="cc-exp"]'
  ];
  
  let expiryField = null;
  for (const selector of expirySelectors) {
    expiryField = document.querySelector(selector);
    if (expiryField) {
      console.log('Payzee: Found expiry field:', selector);
      break;
    }
  }
  
  // Try separate month/year fields first (more common)
  const monthField = document.querySelector('input[name*="month" i], select[name*="month" i], input[placeholder="MM"], input[aria-label*="month" i]');
  const yearField = document.querySelector('input[name*="year" i], select[name*="year" i], input[placeholder="YY"], input[aria-label*="year" i]');
  
  if (monthField && yearField && card.exp_month && card.exp_year) {
    console.log('Payzee: Found separate month/year fields');
    // Separate fields
    const monthValue = card.exp_month.toString().padStart(2, '0');
    const yearValue = card.exp_year.toString().slice(-2); // Last 2 digits (2032 -> 32)
    
    console.log('Payzee: Filling month:', monthValue, 'year:', yearValue);
    setInputValue(monthField, monthValue);
    setInputValue(yearField, yearValue);
  } else if (expiryField && card.exp_month && card.exp_year) {
    // Single combined field (MM/YY format)
    console.log('Payzee: Found combined expiry field');
    const expiry = `${card.exp_month.toString().padStart(2, '0')}/${card.exp_year.toString().slice(-2)}`;
    console.log('Payzee: Filling expiry:', expiry);
    setInputValue(expiryField, expiry);
  } else {
    console.warn('Payzee: Expiry field(s) not found or missing data');
  }
  
  // Find CVV/CVC field
  const cvvSelectors = [
    'input[name*="cvv" i]',
    'input[name*="cvc" i]',
    'input[name*="security" i]',
    'input[id*="cvv" i]',
    'input[id*="cvc" i]',
    'input[placeholder*="cvv" i]',
    'input[placeholder*="cvc" i]',
    'input[placeholder*="security" i]',
    'input[autocomplete="cc-csc"]'
  ];
  
  let cvvField = null;
  for (const selector of cvvSelectors) {
    cvvField = document.querySelector(selector);
    if (cvvField) {
      console.log('Payzee: Found CVV field:', selector);
      break;
    }
  }
  
  if (cvvField && card.cvv) {
    setInputValue(cvvField, card.cvv);
  } else {
    console.warn('Payzee: CVV field not found');
  }
  
  // Find cardholder name field (optional)
  const nameSelectors = [
    'input[name*="cardholder" i]',
    'input[name*="card-name" i]',
    'input[name*="card_name" i]',
    'input[name*="name" i][name*="card" i]',
    'input[id*="cardholder" i]',
    'input[placeholder*="name on card" i]',
    'input[placeholder*="cardholder" i]',
    'input[autocomplete="cc-name"]'
  ];
  
  let nameField = null;
  for (const selector of nameSelectors) {
    nameField = document.querySelector(selector);
    if (nameField) {
      console.log('Payzee: Found name field:', selector);
      break;
    }
  }
  
  if (nameField && card.cardholder_name) {
    setInputValue(nameField, card.cardholder_name);
  }
  
  console.log(`Payzee: Autofill completed. Fields filled: ${filledCount}`);
  
  if (filledCount > 0) {
    showNotification('Card details filled automatically!', 'success');
    // Show confirm transaction button after autofill
    showConfirmTransactionButton();
  } else {
    // Payment form is likely inside a cross-origin iframe (Adyen, Stripe, etc.)
    // Show floating card panel so user can copy-paste manually
    console.log('Payzee: No fields filled — showing card details panel for manual entry');
    showNotification('Card created! Copy details into the payment form.', 'success');
    showCardDetailsPanel(card);
  }
}

// Function to show confirm transaction button
function showConfirmTransactionButton() {
  // Check if button already exists
  if (document.getElementById('payzee-confirm-button')) return;
  
  const button = document.createElement('button');
  button.id = 'payzee-confirm-button';
  button.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="margin-right: 8px;">
      <path d="M9 11L12 14L22 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Confirm Transaction
  `;
  
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 16px 24px;
    background: black;
    color: white;
    border: 2px solid black;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    font-family: system-ui, -apple-system, sans-serif;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 999999;
    display: flex;
    align-items: center;
    transition: all 0.3s ease;
    animation: payzee-slide-in 0.3s ease-out;
  `;
  
  // Add slide-in animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes payzee-slide-in {
      from {
        transform: translateY(100px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.25)';
    button.style.background = '#1a1a1a';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    button.style.background = 'black';
  });
  
  button.addEventListener('click', handleConfirmTransaction);
  
  // Hide the "Pay with Payzee" button if it exists
  const payButton = document.getElementById('stellar-pay-button');
  if (payButton) {
    payButton.style.display = 'none';
  }
  
  if (document.body) {
    document.body.appendChild(button);
  }
}

// Store reference to dashboard window
let dashboardWindow = null;

// Handle confirm transaction button click
async function handleConfirmTransaction() {
  const button = document.getElementById('payzee-confirm-button');
  if (!button) return;
  
  if (!cardDetails) {
    showNotification('Card details not available. Please try again.', 'error');
    return;
  }
  
  // Disable button and show loading state
  button.disabled = true;
  button.style.opacity = '0.6';
  button.style.cursor = 'not-allowed';
  button.innerHTML = `
    <div style="
      width: 20px;
      height: 20px;
      border: 3px solid rgba(255,255,255,0.3);
      border-top: 3px solid white;
      border-radius: 50%;
      margin-right: 8px;
      animation: payzee-spin 1s linear infinite;
    "></div>
    Processing...
  `;
  
  // Show loading modal
  showLoadingModal('Confirming transaction');
  
  // Send message to dashboard window to trigger payment
  const message = {
    type: 'STELLAR_PAY_CONFIRM_TRANSACTION',
    timestamp: Date.now()
  };
  
  console.log('Payzee: Sending confirm transaction message to dashboard');
  
  // Send to dashboard popup window
  if (dashboardWindow && !dashboardWindow.closed) {
    console.log('Payzee: Sending to dashboard popup');
    dashboardWindow.postMessage(message, '*');
  } else {
    console.warn('Payzee: Dashboard popup not available');
  }
  
  console.log('Payzee: Confirm transaction message sent');
}

// Handle messages from dashboard
function handleDashboardMessage(event) {
  // Verify origin (allow localhost on any port for dev)
  if (!event.origin.includes('localhost')) {
    console.log('Payzee: Ignoring message from:', event.origin);
    return;
  }
  
  console.log('Payzee: Message received:', event.data);
  
  if (event.data.type === 'CARD_READY') {
    cardDetails = event.data.card;
    console.log('Payzee: Card created successfully');
    
    // Close the popup window
    if (dashboardWindow && !dashboardWindow.closed) {
      dashboardWindow.close();
    }
    
    // Auto-fill card details (or show card panel as fallback)
    setTimeout(() => {
      autoFillCardDetails(cardDetails);
      hideLoadingModal();
    }, 400);
  }
  
  if (event.data.type === 'PAYMENT_COMPLETE') {
    // Close the popup window
    if (dashboardWindow && !dashboardWindow.closed) {
      dashboardWindow.close();
    }
    
    // Show confirmation overlay on merchant page
    hideLoadingModal();
    showConfirmationModal(event.data.card, productDetails);
    console.log('Payzee: Payment completed successfully');
    
    // Remove confirm button after payment
    const confirmButton = document.getElementById('payzee-confirm-button');
    if (confirmButton) {
      confirmButton.remove();
    }
    
    // Re-show pay button
    const payBtn = document.getElementById('stellar-pay-button');
    if (payBtn) payBtn.style.display = 'flex';
  }
}

// Function to show loading modal
function showLoadingModal(message = 'USDC payment in progress') {
  if (!document.body) return null;
  
  const modal = document.createElement('div');
  modal.id = 'payzee-loading-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 9999999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 40px 60px;
    border-radius: 12px;
    border: 2px solid black;
    text-align: center;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  `;
  
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 48px;
    height: 48px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid black;
    border-radius: 50%;
    margin: 0 auto 20px;
    animation: payzee-spin 1s linear infinite;
  `;
  
  const text = document.createElement('div');
  text.textContent = message;
  text.style.cssText = `
    font-size: 18px;
    font-weight: 600;
    color: black;
    margin-bottom: 8px;
  `;
  
  const subtext = document.createElement('div');
  subtext.textContent = 'Please wait...';
  subtext.style.cssText = `
    font-size: 14px;
    color: #666;
  `;
  
  // Add spinner animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes payzee-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
  content.appendChild(spinner);
  content.appendChild(text);
  content.appendChild(subtext);
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  return modal;
}

// Function to hide loading modal
function hideLoadingModal() {
  const modal = document.getElementById('payzee-loading-modal');
  if (modal && modal.parentNode) {
    modal.remove();
  }
}

// Function to show confirmation modal
function showConfirmationModal(paymentDetails, productDetails) {
  if (!document.body) return;

  const modal = document.createElement('div');
  modal.id = 'payzee-confirmation-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    z-index: 9999999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
    overflow-y: auto;
    padding: 20px;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 48px;
    border-radius: 16px;
    border: 3px solid black;
    max-width: 680px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    max-height: 90vh;
    overflow-y: auto;
  `;

  const transactionId = 'PZ' + Date.now() + Math.random().toString(36).substring(2, 9).toUpperCase();
  const now = new Date();
  const dateOptions = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true
  };

  // Build product details section
  let productSection = '';
  if (productDetails && productDetails.productName) {
    productSection = `
      <div style="background: white; border: 2px solid #e5e5e5; border-radius: 10px; padding: 24px; margin-bottom: 28px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
        <h3 style="font-size: 18px; margin: 0 0 18px 0; color: black; font-weight: 700; letter-spacing: -0.3px;">Booking Details</h3>
        ${productDetails.image ? `
          <div style="margin-bottom: 18px; border-radius: 8px; overflow: hidden; border: 2px solid #f0f0f0;">
            <img src="${productDetails.image}" alt="Property" style="width: 100%; height: 200px; object-fit: cover; display: block;" />
          </div>
        ` : ''}
        ${productDetails.productName ? `
          <div style="margin-bottom: 14px;">
            <strong style="font-size: 17px; color: black; font-weight: 700;">${productDetails.productName}</strong>
          </div>
        ` : ''}
        ${productDetails.location ? `
          <div style="margin-bottom: 8px; color: #666; font-size: 14px;">
            📍 ${productDetails.location}
          </div>
        ` : ''}
        ${productDetails.rating ? `
          <div style="margin-bottom: 14px; display: inline-block; background: #fafafa; padding: 6px 12px; border-radius: 6px; border: 1px solid #e5e5e5;">
            <span style="font-size: 14px; font-weight: 600; color: black;">⭐ ${productDetails.rating}</span>
          </div>
        ` : ''}
        ${productDetails.checkIn || productDetails.checkOut ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 18px; padding-top: 18px; border-top: 2px solid #f0f0f0;">
            ${productDetails.checkIn ? `
              <div style="background: #fafafa; padding: 12px; border-radius: 6px; border: 1px solid #e5e5e5;">
                <div style="font-size: 11px; color: #999; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Check-In</div>
                <div style="font-size: 15px; font-weight: 700; color: black;">${productDetails.checkIn}</div>
              </div>
            ` : ''}
            ${productDetails.checkOut ? `
              <div style="background: #fafafa; padding: 12px; border-radius: 6px; border: 1px solid #e5e5e5;">
                <div style="font-size: 11px; color: #999; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Check-Out</div>
                <div style="font-size: 15px; font-weight: 700; color: black;">${productDetails.checkOut}</div>
              </div>
            ` : ''}
          </div>
        ` : ''}
        ${productDetails.duration ? `
          <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid #f0f0f0; font-size: 14px; color: #666; font-weight: 500;">
            ${productDetails.duration}
          </div>
        ` : ''}
      </div>
    `;
  }

  content.innerHTML = `
    <div style="text-align: center; margin-bottom: 35px;">
      <div style="
        width: 80px;
        height: 80px;
        background: black;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 24px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      ">
        <div style="
          width: 36px;
          height: 36px;
          border: 4px solid white;
          border-top: none;
          border-right: none;
          transform: rotate(-45deg);
          margin-top: -10px;
        "></div>
      </div>
      <h2 style="font-size: 32px; margin-bottom: 12px; color: black; font-weight: 700; letter-spacing: -0.5px;">Payment Confirmed</h2>
      <p style="color: #666; font-size: 17px; font-weight: 500;">Transaction completed via USDC</p>
    </div>

    ${productSection}

    <div style="background: linear-gradient(135deg, #f0f0f0 0%, #fafafa 100%); border: 2px solid #e0e0e0; border-radius: 8px; padding: 18px; margin-bottom: 28px; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 20px;">🔐</span>
        <div style="flex: 1;">
          <div style="font-size: 12px; color: #999; margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Transaction ID</div>
          <div style="font-size: 15px; font-weight: 700; color: black; font-family: monospace; letter-spacing: 0.5px;">${transactionId}</div>
        </div>
      </div>
    </div>

    <div style="background: #fafafa; border: 3px solid black; border-radius: 12px; padding: 28px; margin-bottom: 28px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 14px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Payment Amount</div>
        ${paymentDetails.original_amount ? `
        <div style="margin-bottom: 16px; padding: 16px; background: white; border: 2px solid #e5e5e5; border-radius: 8px;">
          <div style="font-size: 13px; color: #999; margin-bottom: 6px; font-weight: 500;">Merchant Price</div>
          <div style="font-size: 28px; font-weight: 700; color: black; letter-spacing: -0.5px;">${paymentDetails.original_amount}</div>
        </div>
        <div style="margin: 16px 0; color: #999; font-size: 13px; font-weight: 600;">
          ⬇️ Converted to
        </div>
        ` : ''}
        <div style="padding: 20px; background: black; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
          <div style="font-size: 13px; color: #aaa; margin-bottom: 8px; font-weight: 500;">Paid with USDC</div>
          <div style="font-size: 36px; font-weight: 800; color: white; letter-spacing: -1px;">$${parseFloat(paymentDetails.amount_usd).toFixed(2)}</div>
          <div style="font-size: 13px; color: #999; margin-top: 6px; font-weight: 500;">United States Dollar</div>
        </div>
      </div>
    </div>
    
    <div style="background: white; border: 2px solid #e5e5e5; border-radius: 10px; padding: 24px; margin-bottom: 28px;">
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="font-weight: 600; color: #666; font-size: 14px;">Payment Method</span>
        <span style="font-weight: 600; color: black; font-size: 14px;">USDC (Virtual Card)</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="font-weight: 600; color: #666; font-size: 14px;">Date & Time</span>
        <span style="font-weight: 500; color: black; font-size: 14px;">${now.toLocaleString('en-US', dateOptions)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 0;">
        <span style="font-weight: 600; color: #666; font-size: 14px;">Status</span>
        <span style="background: black; color: white; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 13px;">✓ COMPLETED</span>
      </div>
    </div>

    <div style="margin-top: 32px; text-align: center;">
      <button id="payzee-close-confirmation" style="
        padding: 16px 48px;
        background: black;
        color: white;
        border: 3px solid black;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 1px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      " onmouseover="this.style.background='white'; this.style.color='black';" onmouseout="this.style.background='black'; this.style.color='white';">Close</button>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  // Close button handler
  document.getElementById('payzee-close-confirmation').addEventListener('click', () => {
    modal.remove();
  });

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Function to show notification
function showNotification(message, type = 'info') {
  if (!document.body) return;
  
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 14px 22px;
    background: white;
    color: black;
    border: 2px solid black;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 999999;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 500;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}

// Initialize extension
function init() {
  if (isCheckoutPage()) {
    console.log('Payzee: Checkout page detected');
    setTimeout(() => {
      createPayButton();
    }, 1000);
  }
}

// Wait for page to load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('Payzee: Extension ready');
