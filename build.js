'use strict'

var fs = require('async-file')
var wget = require('node-wget-promise')
var docker_parser = require('docker-file-parser')
var dockerHubAPI = require('docker-hub-api')
var hubCredentials = require('./credentials.json')
var tar = require('tar-fs')
var util = require('util')
const { Docker } = require('node-docker-api')
const execSync = require('child_process').execSync

const docker = new Docker()
const tag = '1234'
const repo = 'army'

function parsedDockerfileContent (data) {
  let commands = docker_parser.parse(data, { includeComments: false })
  let parsedCommands = commands.map(x => x['raw'])

  parsedCommands.splice(1, 0, 'RUN [ "cross-build-start" ]')
  parsedCommands.push('RUN [ "cross-build-end" ]\n')

  return parsedCommands
}

async function fixDockerfile () {
  let data = await fs.readFile('Dockerfile', 'utf8')

  // these 2 in parallel smh?
  await fs.rename('Dockerfile', 'originalDockerfile')
  var parsedCommands = parsedDockerfileContent(data)

  await fs.writeFile('Dockerfile', parsedCommands.join('\n'))
  console.log('The file was generated!')
}

var url =
  'https://gist.githubusercontent.com/monicabaluna/15c29dc6004eeb04bbbd4ebeef7da354/raw/eff45047a7d610a7a80f7cb8b4c9e587176d1480/Dockerfile'

const promisifyStream = stream =>
  new Promise((resolve, reject) => {
    stream.on('data', data => console.log(data.toString()))
    stream.on('end', resolve)
    stream.on('error', reject)
  })

async function main () {
  let fullTag = hubCredentials['username'] + '/' + repo + ':' + tag

  try {
    // await wget(url);
    // await fixDockerfile();
    let tarStream = tar.pack('.')
    let stream = await docker.image.build(tarStream, { t: fullTag })
    let dockerStream = promisifyStream(stream)

    // let info = await dockerHubAPI.login(
    //   hubCredentials['username'],
    //   hubCredentials['password']
    // )

    let code = execSync(
      'docker login -u ' +
        hubCredentials['username'] +
        ' -p ' +
        hubCredentials['password']
    )
    console.log(code.toString())

    console.log('Logged into dockerhub!')

    let code2 = execSync('docker push ' + fullTag)
    console.log(code2.toString())

    // console.log(info)
  } catch (err) {
    console.log(err)
  }
}

main()
