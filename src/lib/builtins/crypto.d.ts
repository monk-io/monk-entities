/**
 * Crypto module for cryptographic operations (provided by Goja runtime)
 */
declare module "crypto" {
  /**
   * Crypto interface
   */
  interface CryptoModule {
    /**
     * Creates a SHA256 hash of the input string
     * @param input - The string to hash
     * @returns The SHA256 hash as a hexadecimal string
     */
    sha256(input: string): string;
    /**
     * Creates an HMAC-SHA256 hash of the input string
     * @param key - The key to use for the HMAC
     * @param input - The string to hash
     * @returns The HMAC-SHA256 hash as a hexadecimal string
     */
    hmac(key: string, input: string): string;
  }

  const crypto: CryptoModule;
  export default crypto;
}