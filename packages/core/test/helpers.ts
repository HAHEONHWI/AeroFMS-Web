import initSqlJs from 'sql.js'
import { SqlJsDriver } from '../src'

export async function memoryDb(): Promise<SqlJsDriver> {
  const SQL = await initSqlJs()
  return new SqlJsDriver(new SQL.Database())
}
