declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }
  interface Database {
    run(sql: string, params?: any[]): void;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }
  interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    get(): any[];
    getAsObject(params?: any): Record<string, any>;
    getColumnNames(): string[];
    free(): boolean;
    reset(): void;
  }
  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }
  function initSqlJs(config?: any): Promise<SqlJsStatic>;
  export default initSqlJs;
  export { type Database, type Statement, type SqlJsStatic, type QueryExecResult };
}
