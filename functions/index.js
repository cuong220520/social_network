const functions = require('firebase-functions')
const express = require('express')
const app = express()

const { db } = require('./util/admin')

const { 
    getAllScreams, 
    postOneScream, 
    getScream, 
    commentOnScream, 
    likeScream, 
    unlikeScream, 
    deleteScream 
} = require('./handlers/screams')

const { 
    signup, 
    login, 
    uploadImage, 
    addUserDetails, 
    getAuthenticatedUser,
    getUserDetails,
    markNotificationsRead
} = require('./handlers/users')

const fbAuth = require('./util/fbAuth')

// signup route
app.post('/signup', signup)

// login route
app.post('/login', login)

// add user detail route
app.post('/user', fbAuth, addUserDetails)

// get user infor route
app.get('/user', fbAuth, getAuthenticatedUser)

// upload profile image route
app.post('/user/image', fbAuth, uploadImage)

// get any user infor route
app.get('/user/:handle', getUserDetails)

// mark notifications read
app.post('/notifications', fbAuth, markNotificationsRead)

// get screams route
app.get('/screams', getAllScreams)

// post scream route
app.post('/scream', fbAuth, postOneScream)  

// get one scream route
app.get('/scream/:screamId', getScream)

// post a comment on a scream route
app.post('/scream/:screamId/comment', fbAuth, commentOnScream)

// like a scream route
app.get('/scream/:screamId/like', fbAuth, likeScream)

// unlike a scream route
app.get('/scream/:screamId/unlike', fbAuth, unlikeScream)

// delete a scream route
app.delete('/scream/:screamId', fbAuth, deleteScream)

exports.api = functions.https.onRequest(app)

// like notification trigger
exports.createNotificationOnLike = functions
    .firestore
    .document('/likes/{id}')
    .onCreate(snapshot => {
        return db
            .doc(`/screams/${snapshot.data().screamId}`)
            .get()
            .then(doc => {
                if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                    return db.doc(`/notifications/${snapshot.id}`).set({
                        createAt: new Date().toISOString(),
                        recipient: doc.data().userHandle,
                        sender: snapshot.data().userHandle,
                        type: 'like',
                        read: false,
                        screamId: doc.id
                    })
                }
            })
            .catch(err => {
                console.error(err)
            })
    })

// comment notification trigger
exports.createNotificationOnComment = functions
    .firestore
    .document('/comments/{id}')
    .onCreate(snapshot => {
        return db
            .doc(`/screams/${snapshot.data().screamId}`)
            .get()
            .then(doc => {
                if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                    return db.doc(`/notifications/${snapshot.id}`).set({
                        createAt: new Date().toISOString(),
                        recipient: doc.data().userHandle,
                        sender: snapshot.data().userHandle,
                        type: 'comment',
                        read: false,
                        screamId: doc.id
                    })
                }
            })
            .catch(err => {
                console.error(err)
            })
    })

// unlike notification trigger
exports.deleteNotificationOnUnlike = functions
    .firestore
    .document('/likes/{id}')
    .onDelete((snapshot) => {
        return db 
            .doc(`/notifications/${snapshot.id}`)
            .delete()
            .catch(err => {
                console.error(err)
            })
    })

exports.onUserImageChange = functions
    .firestore
    .document('/users/{userHandle}')
    .onUpdate((change, context) => {
        console.log(change.before.data())
        console.log(change.after.data())

        const userHandle = context.params.userHandle

        console.log(userHandle)

        if (change.before.data().imageUrl !== change.after.data().imageUrl) {
            console.log('image has changed')
            const batch = db.batch()
            return db
                .collection('screams')
                .where('userHandle', '==', change.before.data().handle).get()
                .then(data => {
                    data.forEach(doc => {
                        const scream = db.doc(`/screams/${doc.id}`)
                        batch.update(scream, { userImage: change.after.data().imageUrl })
                    })
                    return db.collection('comments').where('userHandle', '==', userHandle).get()
                })
                .then(data => {
                    data.forEach(doc => {
                        const comment = db.doc(`/comments/${doc.id}`)
                        batch.update(comment, { userImage: change.after.data().imageUrl })
                    })
                    return batch.commit()
                })
        } else return true
    })

exports.onScreamDelete = functions
    .firestore
    .document('/screams/{screamId}')
    .onDelete((snapshot, context) => {
        const screamId = context.params.screamId
        const batch = db.batch()
        return db
            .collection('comments')
            .where('screamId', '==', screamId)
            .get()
            .then(data => {
                data.forEach(doc => {
                    batch.delete(db.doc(`/comments/${doc.id}`))
                })
                return db.collection('likes').where('screamId', '==', screamId).get()
            })
            .then(data => {
                data.forEach(doc => {
                    batch.delete(db.doc(`/likes/${doc.id}`))
                })
                return db.collection('notifications').where('screamId', '==', screamId).get()
            })
            .then(data => {
                data.forEach(doc => {
                    batch.delete(db.doc(`/notifications/${doc.id}`))
                })
                return batch.commit()
            })
            .catch(err => {
                console.error(err)
            })
    })