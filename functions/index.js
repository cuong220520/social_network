const functions = require('firebase-functions')
const express = require('express')
const app = express()

const { getAllScreams, postOneScream } = require('./handlers/screams')

const { signup, login } = require('./handlers/users')

const fbAuth = require('./util/fbAuth')

// get screams route
app.get('/screams', fbAuth, getAllScreams)

// post scream route
app.post('/scream', fbAuth, postOneScream)  

// signup route
app.post('/signup', signup)

// login route
app.post('/login', login)

exports.api = functions.https.onRequest(app)