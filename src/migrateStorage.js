// Imported first by the entry point, so browser storage saved under the
// app's former name is under the new one before any module reads it.
import { migrateStorage } from './legacy'

migrateStorage()
