/**
 * File system module for file operations (provided by Goja runtime)
 */
declare module "fs" {
  /**
   * File system operations interface
   */
  interface FSModule {
    /**
     * Lists files and directories
     * @param path - Optional path to list (defaults to current directory)
     * @returns Array of file and directory names
     */
    ls(path?: string): string[];

    /**
     * Reads a file's contents
     * @param path - Path to the file
     * @returns The file contents as a string
     */
    readFile(path: string): string;

    /**
     * Creates a ZIP archive from the specified paths
     * @param paths - Paths to include in the archive
     * @returns The ZIP archive as a string
     */
    zip(...paths: string[]): string;

    /**
     * Creates a TAR archive from the specified paths
     * @param paths - Paths to include in the archive
     * @returns The TAR archive as a string
     */
    tar(...paths: string[]): string;
  }

  const fs: FSModule;
  export default fs;
}
