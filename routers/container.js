;('use strict')
var express = require('express')
var router = express.Router()
var log = require('bunyan').getLogger('container')
var error = require('../error.js')
var fs = require('fs')
var asyncFs = require('async-file')
var formidable = require('formidable')
var util = require('util')
var unzip = require('unzip')
var md5 = require('md5')
var dockerParser = require('docker-file-parser')
var tar = require('tar-fs')
const { Docker } = require('node-docker-api')
const execSync = require('child_process').execSync
var HttpStatus = require('http-status-codes')

const docker = new Docker()

function parsedDockerfileContent (data) {
  let commands = dockerParser.parse(data, { includeComments: false })
  let parsedCommands = commands.map(x => x['raw'])

  if (
    parsedCommands.length == 0 ||
    parsedCommands[0].substring(0, 11) !== 'FROM resin/' ||
    parsedCommands[1] === 'RUN [ "cross-build-start" ]'
  ) {
    return parsedCommands
  }

  parsedCommands.splice(1, 0, 'RUN [ "cross-build-start" ]')
  parsedCommands.push('RUN [ "cross-build-end" ]\n')

  return parsedCommands
}

async function fixDockerfile (dockerfilePath) {
  let data = await asyncFs.readFile(dockerfilePath, 'utf8')

  var parsedCommands = parsedDockerfileContent(data)

  await asyncFs.unlink(dockerfilePath)

  await asyncFs.writeFile(dockerfilePath, parsedCommands.join('\n'))
  log.info('The file was generated!')
}

const promisifyStream = stream =>
  new Promise((resolve, reject) => {
    stream.on('data', data => log.info(data.toString()))
    stream.on('end', resolve)
    stream.on('error', reject)
  })

const pathExists = path =>
  new Promise((resolve, reject) => {
    fs.access(path, fs.constants.F_OK, err => {
      if (err !== null && err.code !== 'ENOENT') return reject(err)
      resolve(err === null)
    })
  })

const extractAsync = (zipPath, outputPath) =>
  new Promise((resolve, reject) => {
    const extractor = unzip.Extract({ path: outputPath })

    extractor.on('close', resolve)
    extractor.on('error', reject)

    fs.createReadStream(zipPath).pipe(extractor)
  })

/**
 * @api {post} / Send an archive with stuff to dockerize
 * @apiName Post
 * @apiGroup User
 *
 * @apiParam {String} username Username
 *
 * @apiSuccess {Number} err 0
 * @apiError {String} err Error
 * @apiError {String} statusError error
 */
router.post('/build-archive', async function (req, res) {
  const uploadDir = 'files/'
  var form = new formidable.IncomingForm({ uploadDir: uploadDir })

  form.parse(req, async function (err, fields, files) {
    var oldpath = files.filetoupload.path
    var checksum = md5(await asyncFs.readFile(oldpath))
    var contentPath = `${uploadDir}${checksum}`
    var newpath = `${contentPath}.zip`

    username = fields.username
    password = fields.password

    await asyncFs.rename(oldpath, newpath)
    log.info(`Upload zip to ${newpath}`)

    await extractAsync(newpath, contentPath)

    try {
      let imageConfiguration = JSON.parse(
        await asyncFs.readFile(`${contentPath}/wyliodrin.json`, 'utf8')
      )

      let fullTag = `${username}/${imageConfiguration.repository}:${imageConfiguration.tag}`
      await fixDockerfile(`${contentPath}/Dockerfile`)

      let tarStream = tar.pack(`${contentPath}`)
      let stream = await docker.image.build(tarStream, { t: fullTag })

      await promisifyStream(stream)

      execSync(`docker login -u ${username} -p ${password}`)

      let code = execSync(`docker push ${fullTag}`)
      log.info(code.toString())
    } catch (err) {
      throw err
    }

    res.send(util.inspect({ fields: fields, files: files }))
  })
})

router.post('/build-repository', async function (
  { body: { source_url, branch, username, password, repository, tag } },
  res
) {
  const uploadDir = 'files/'

  try {
    let fullTag = `${username}/${repository}:${tag}`
    var sha = execSync(`git ls-remote -h ${source_url} -t ${branch} | cut -f 1`)
    var contentPath = `${uploadDir}${sha.toString().trim()}`

    let repoIsCached = await pathExists(contentPath)
    if (!repoIsCached) {
      execSync(
        `git clone --recursive -b ${branch} ${source_url} ${contentPath}`
      )
    }
    await fixDockerfile(`${contentPath}/Dockerfile`)

    let tarStream = tar.pack(`${contentPath}`)
    let stream = await docker.image.build(tarStream, { t: fullTag })

    await promisifyStream(stream)

    execSync(`docker login -u ${username} -p ${password}`)

    let code = execSync(`docker push ${fullTag}`)
    log.info(code.toString())
  } catch (err) {
    throw err
  }

  res.sendStatus(HttpStatus.OK)
})

module.exports.router = router
