const { db, admin } = require('../util/admin')

const config = require('../util/config')

const firebase = require('firebase')
firebase.initializeApp(config)

const { validateSignupData, validateLoginData, reduceUserDetails } = require('../util/validators')

// signup
exports.signup = (req, res) => {
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle
    }

    const { valid, errors } = validateSignupData(newUser)

    if (!valid) return res.status(400).json(errors)

    const noImg = 'no-img.png'

    let token, userId

    db
        .doc(`/users/${newUser.handle}`)
        .get()
        .then(doc => {
            if (doc.exists) {
                return res.status(400).json({ handle: 'this handle is already taken!' })
            } else {
                return firebase
                    .auth()
                    .createUserWithEmailAndPassword(newUser.email, newUser.password)
            }
        })
        .then(data => {
            userId = data.user.uid
            return data.user.getIdToken()
        })
        .then(idToken => {
            token = idToken
            const userCredentials = {
                handle: newUser.handle,
                email: newUser.email,
                createAt: new Date().toISOString(),
                imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
                userId: userId
            }
            return db.doc(`/users/${newUser.handle}`).set(userCredentials)
        })
        .then(() => {
            return res.status(201).json({ token })
        })
        .catch(err => {
            console.error(err)
            if (err.code === 'auth/email-already-in-use') {
                return res.status(400).json({ email: 'Email already in use' })
            } else {
                return res.status(500).json({ general: 'something went wrong, please try again' })
            }
        })
}

// login
exports.login = (req, res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    }

    const { valid, errors } = validateLoginData(user)

    if (!valid) return res.status(400).json(errors)

    firebase
        .auth()
        .signInWithEmailAndPassword(user.email, user.password)
        .then(data => {
            return data.user.getIdToken()
        })
        .then(token => {
            return res.json({ token })
        })
        .catch(err => {
            console.error(err)
            return res.status(403).json({ general: 'wrong credentials, please try again' })
        })
}

// get user detail
exports.getAuthenticatedUser = (req, res) => {
    let userData = {}

    db
        .doc(`/users/${req.user.handle}`).get()
        .then(doc => {
            if (doc.exists) {
                userData.credentials = doc.data()
                return db.collection('likes').where('userHandle', '==', req.user.handle).get()
            }
        })
        .then(data => {
            userData.likes = []
            data.forEach(doc => {
                userData.likes.push(doc.data())
            })
            return db
                .collection('notifications')
                .where('recipient', '==', req.user.handle)
                .orderBy('createAt', 'desc')
                .limit(10)
                .get()
        })
        .then(data => {
            userData.notifications = []

            data.forEach(doc => {
                userData.notifications.push({
                    createAt: doc.data().createAt,
                    recipient: doc.data().recipient,
                    sender: doc.data().sender,
                    type: doc.data().type,
                    read: doc.data().read,
                    screamId: doc.data().screamId,
                    notificationId: doc.id
                })
            })

            return res.json(userData)
        })
        .catch(err => {
            console.error(err)
            return res.status(500).json({ error: err.code })
        })
}

// add user detail
exports.addUserDetails = (req, res) => {
    let userDetails = reduceUserDetails(req.body)

    db
        .doc(`/users/${req.user.handle}`)
        .update(userDetails)
        .then(() => {
            return res.json({ message: 'details added successfully' })
        })
        .catch(err => {
            console.error(err)
            return res.status(500).json({ error: err.code })
        })
}

// upload profile image
exports.uploadImage = (req, res) => {
    const Busboy = require('busboy')
    const path = require('path')
    const os = require('os')
    const fs = require('fs')

    const busboy = new Busboy({ headers: req.headers })

    let imageFileName
    let imageToBeUploaded = {}

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        // console.log(fieldname)
        // console.log(filename)
        // console.log(mimetype)

        if (mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
            return res.status(400).json({ error: 'wrong file type submitted' })
        }
        
        const imageExtention = filename.split('.')[filename.split('.').length - 1]
        // 784578325849398.png
        imageFileName = `${Math.round(Math.random()*100000000000)}.${imageExtention}`
        const filePath = path.join(os.tmpdir(), imageFileName)
        imageToBeUploaded = { filePath, mimetype }
        file.pipe(fs.createWriteStream(filePath))
    })

    busboy.on('finish', () => {
        admin
            .storage()
            .bucket()
            .upload(imageToBeUploaded.filePath, {
                resumable: false, 
                metadata: {
                    metadata: {
                        contentType: imageToBeUploaded.mimetype
                    }
                }
            })
            .then(() => {
                const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`
                return db.doc(`/users/${req.user.handle}`).update({ imageUrl })
            })
            .then(() => {
                return res.json({ message: 'image uploaded successfully' })
            })
            .catch(err => {
                console.error(err)
                return res.status(500).json({ error: err.code })
            })
    })

    busboy.end(req.rawBody)
}

// get any user infor 
exports.getUserDetails = (req, res) => {
    let userData = {}

    db
        .doc(`/users/${req.params.handle}`)
        .get()
        .then(doc => {
            if (doc.exists) {
                userData.user = doc.data()
                return db
                    .collection('screams')
                    .where('userHandle', '==', req.params.handle)
                    .orderBy('createAt', 'desc')
                    .get()
            } else {
                return res.status(404).json({ error: 'user not found' })
            }
        })
        .then(data => {
            userData.screams = []
            data.forEach(doc => {
                userData.screams.push({
                    body: doc.data().body,
                    createAt: doc.data().createAt,
                    userHandle: doc.data().userHandle,
                    userImage: doc.data().userImage,
                    likeCount: doc.data().likeCount,
                    commentCount: doc.data().commentCount,
                    screamId: doc.id
                })
            })
            return res.json(userData)
        })
        .catch(err => {
            console.error(err)
            return res.status(500).json({ error: err.code })
        })
}

exports.markNotificationsRead = (req, res) => {
    let batch = db.batch()

    req.body.forEach(notificationId => {
        const notification = db.doc(`/notifications/${notificationId}`)
        batch.update(notification, { read: true })
    })

    batch
        .commit()
        .then(() => {
            return res.json({ message: 'notifications marked read' })
        })
        .catch(err => {
            console.error(err)
            return res.status(500).json({ error: err.code })
        })
}