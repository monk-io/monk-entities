/**
 * Core types and globals for the Monk framework (provided by Goja runtime)
 */

/**
 * Console interface for logging (provided by Goja runtime)
 */
declare interface Console {
  /**
   * Outputs a message to the console
   * @param message - The message to log
   * @param optionalParams - Additional parameters to log
   */
  log(message?: any, ...optionalParams: any[]): void;

  /**
   * Outputs an error message to the console
   * @param message - The error message to log
   * @param optionalParams - Additional parameters to log
   */
  error(message?: any, ...optionalParams: any[]): void;

  /**
   * Outputs a warning message to the console
   * @param message - The warning message to log
   * @param optionalParams - Additional parameters to log
   */
  warn(message?: any, ...optionalParams: any[]): void;

  /**
   * Outputs an informational message to the console
   * @param message - The info message to log
   * @param optionalParams - Additional parameters to log
   */
  info(message?: any, ...optionalParams: any[]): void;

  /**
   * Outputs a debug message to the console
   * @param message - The debug message to log
   * @param optionalParams - Additional parameters to log
   */
  debug(message?: any, ...optionalParams: any[]): void;
}

/**
 * Global console object (provided by Goja runtime)
 */
declare var console: Console;
