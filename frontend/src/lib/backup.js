/** Overlay a backup file onto a fresh profile. Unknown fields from the file win;
 *  anything the file does not mention keeps the default. */
export function restoreBackup(data, base) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.workouts) || !Array.isArray(data.routines)) {
    throw new Error('not an openGym backup')
  }
  return Object.assign(JSON.parse(JSON.stringify(base)), data)
}
