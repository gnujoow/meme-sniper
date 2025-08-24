import bs58 from 'bs58';

export class AddressDetector {
  constructor() {
    // Solana address: base58 encoded, typically 32-44 characters
    // Common patterns: starts with numbers/letters, 32-44 chars
    this.solanaRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
    
    // BSC/Ethereum address: 0x followed by 40 hex characters
    this.bscRegex = /\b0x[a-fA-F0-9]{40}\b/g;
    
    // Additional keyword patterns for crypto context
    this.keywordPatterns = [
      /\bpump\b/gi,
      /\launch\b/gi,
      /\btoken\b/gi,
      /\bcontract\b/gi,
      /\bmint(?:ing|ed)?\b/gi,
      /\bdeploy(?:ing|ed)?\b/gi,
      /\blive\b/gi,
      /\bCA\b/g,  // Contract Address abbreviation
      /\bSOL\b/g,
      /\bBSC\b/g,
      /\bairdrop\b/gi,
      /\bpresale\b/gi,
      /\bliquidity\b/gi,
      /\bDEX\b/g
    ];
  }

  /**
   * Validate if a string is a valid Solana address
   */
  isValidSolanaAddress(address) {
    try {
      const decoded = bs58.decode(address);
      return decoded.length === 32;
    } catch {
      return false;
    }
  }

  /**
   * Validate if a string is a valid BSC/Ethereum address
   */
  isValidBSCAddress(address) {
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return false;
    }
    return true;
  }

  /**
   * Extract Solana addresses from text
   */
  extractSolanaAddresses(text) {
    const matches = text.match(this.solanaRegex) || [];
    return matches.filter(match => this.isValidSolanaAddress(match));
  }

  /**
   * Extract BSC addresses from text
   */
  extractBSCAddresses(text) {
    const matches = text.match(this.bscRegex) || [];
    return matches.filter(match => this.isValidBSCAddress(match));
  }

  /**
   * Check if text contains crypto-related keywords
   */
  containsCryptoKeywords(text) {
    const foundKeywords = [];
    for (const pattern of this.keywordPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        foundKeywords.push(...matches);
      }
    }
    return [...new Set(foundKeywords)]; // Remove duplicates
  }

  /**
   * Extract URLs from tweet text
   */
  extractUrls(text) {
    // URL regex pattern for http/https URLs and t.co short links
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    const tcoRegex = /https:\/\/t\.co\/[a-zA-Z0-9]+/g;
    
    const httpUrls = text.match(urlRegex) || [];
    const tcoUrls = text.match(tcoRegex) || [];
    
    return [...httpUrls, ...tcoUrls];
  }

  /**
   * Analyze tweet for crypto addresses and keywords
   */
  analyzeTweet(tweetText) {
    const solanaAddresses = this.extractSolanaAddresses(tweetText);
    const bscAddresses = this.extractBSCAddresses(tweetText);
    const keywords = this.containsCryptoKeywords(tweetText);
    const urls = this.extractUrls(tweetText);
    
    return {
      hasCryptoContent: solanaAddresses.length > 0 || bscAddresses.length > 0 || keywords.length > 0,
      solanaAddresses,
      bscAddresses,
      keywords,
      urls,
      timestamp: new Date().toISOString()
    };
  }
}