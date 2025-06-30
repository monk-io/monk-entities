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
  }

  const crypto: CryptoModule;
  export default crypto;
}