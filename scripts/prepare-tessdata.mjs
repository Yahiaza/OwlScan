import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDirectory = join(projectRoot, 'resources', 'tessdata')
const packages = ['@tesseract.js-data/ara', '@tesseract.js-data/eng']

async function findLanguageFile(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findLanguageFile(entryPath)
      if (nested) return nested
    } else if (entry.name.endsWith('.traineddata.gz')) {
      return entryPath
    }
  }
  return undefined
}

await mkdir(outputDirectory, { recursive: true })

for (const packageName of packages) {
  const packageDirectory = dirname(require.resolve(`${packageName}/package.json`))
  const languageFile = await findLanguageFile(packageDirectory)
  if (!languageFile) throw new Error(`No traineddata file found in ${packageName}`)
  await copyFile(languageFile, join(outputDirectory, languageFile.split(/[\\/]/).at(-1)))
}

console.log('Prepared bundled Arabic and English OCR data.')
