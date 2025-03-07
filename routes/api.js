var express = require('express');
let admin = require('firebase-admin');
var router = express.Router() ;
var apn = require('apn');

const wrap = fn => (...args) => fn(...args).catch(args[2]) ;

// registerDevice
router.post('/registerDevice', wrap(async function(req, res, next) {
    let key = req.body["key"] ;

    if (key != process.env.API_KEY) {
        let result = {} ;

        result["result"] = false ;
    
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));	

        return ;
    }

    let userId = req.body["userId"] ;
    let talkId = req.body["talkId"] ;
    let deviceToken = req.body["deviceToken"] ;

    req.body["timestamp"] = Date.now() ;
    req.body["lastPublishTimestamp"] = 0 ;

    if (deviceToken != "" && deviceToken != undefined) {
        let talkDoc = admin.firestore().collection("talks").doc(talkId) ;

        let talkSnapshot = await talkDoc.get() ;
        let talkData = talkSnapshot.data() ;

        if (talkData == null) {
            await talkDoc.set({"userCount" : "1"}) ;
            await talkDoc.collection("users").doc(userId).set(req.body) ;
        } else {
            let userDoc = talkDoc.collection("users").doc(userId) ;

            let userSnapshot = await userDoc.get() ;
            let userData = userSnapshot.data() ;

            if (userData == null) {
                let userCount = Number(talkData["userCount"]) ;

                userCount++ ;

                await talkDoc.set({"userCount" :userCount}) ;
            }
                
            await userDoc.set(req.body) ;
        }
    }

    let result = {} ;

    result["result"] = true ;

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));	
})) ;

// unregisterDevice
router.post('/unregisterDevice', wrap(async function(req, res, next) {
    let key = req.body["key"] ;

    if (key != process.env.API_KEY) {
        let result = {} ;

        result["result"] = false ;
    
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));	

        return ;
    }

    let userId = req.body["userId"] ;
    let talkId = req.body["talkId"] ;
    
    let talkDoc = admin.firestore().collection("talks").doc(talkId) ;
    let userDoc = talkDoc.collection("users").doc(userId) ;

    let userSnapshot = await userDoc.get() ;
    let userData = userSnapshot.data() ;

    if (userData != null) {
        await userDoc.delete() ;

        let talkSnapshot = await talkDoc.get() ;
        let talkData = talkSnapshot.data() ;
        let userCount = Number(talkData["userCount"]) ;

        userCount--;

        if (userCount == 0) {
            await talkDoc.delete() ;
        } else {
            await talkDoc.set({"userCount" :userCount}) ;
        }
    }

    let result = {} ;

    result["result"] = true ;

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));	
})) ;

// updateDeviceStatus
router.post('/updateDeviceStatus', wrap(async function(req, res, next) {
    let key = req.body["key"] ;

    if (key != process.env.API_KEY) {
        let result = {} ;

        result["result"] = false ;
    
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));	

        return ;
    }

    let userId = req.body["userId"] ;
    let talkId = req.body["talkId"] ;
    
    req.body["timestamp"] = Date.now() ;

    let talkDoc = admin.firestore().collection("talks").doc(talkId) ;
    let userDoc = talkDoc.collection("users").doc(userId) ;

    let userSnapshot = await userDoc.get() ;
    let userData = userSnapshot.data() ;

    if (userData != null) {
        await userDoc.update(req.body) ;
    }

    let result = {} ;

    result["result"] = true ;

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));	
})) ;

// pushNewUtteranceNotification
router.post('/pushNewUtteranceNotification', wrap(async function(req, res, next) {
    let key = req.body["key"] ;

    if (key != process.env.API_KEY) {
        let result = {} ;

        result["result"] = false ;
    
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));	

        return ;
    }

    let userId = req.body["userId"] ;
    let talkId = req.body["talkId"] ;
    let forcePublishing = req.body["forcePublishing"] ;

    let talkDoc = admin.firestore().collection("talks").doc(talkId) ;

    let timestamp = Date.now() ;
    let usersDoc ;

    if (forcePublishing == "1") {
        usersDoc = talkDoc.collection("users") ;
    } else {
        usersDoc = talkDoc.collection("users").where('timestamp', '<=', timestamp - 70 * 1000).where('timestamp', '>=', timestamp - 120 * 60 * 1000) ;
    }

    let usersSnapshot = await usersDoc.get() ;
    
    usersSnapshot.forEach(userSnapshot => {
        let userData = userSnapshot.data() ;

        if (userData["userId"] != userId && 
            (userData["lastPublishTimestamp"] <= timestamp - 15 * 60 * 1000 || forcePublishing == "1")) { 

            if (userData["type"] == "iOS" || userData["type"] == "watchOS" || userData["type"] == "watchOS_via_iOS") {
                
                let bundleId = "" ;
                
                if (userData["type"] == "iOS" || userData["type"] == "watchOS_via_iOS") {
                    bundleId = process.env.APPLE_IOS_APP_BUNDLE_ID ;
                } else if (userData["type"] == "watchOS") {
                    bundleId = process.env.APPLE_WATCHOS_APP_BUNDLE_ID ;
                }

                sendPushNotification(
                    userData["deviceToken"], 
                    userData["env"] == "pro", 
                    userData["languageCode"],
                    bundleId,
                    userData["type"]) ;

                if (forcePublishing != "1") {
                    userData["lastPublishTimestamp"] = timestamp ;
                }

                let userDoc = talkDoc.collection("users").doc(userData["userId"]) ;

                userDoc.update(userData) ;
            } else if (userData["type"] == "Android") {
                sendFCM(
                    userData["deviceToken"], 
                    userData["languageCode"]) ;

                if (forcePublishing != "1") {
                    userData["lastPublishTimestamp"] = timestamp ;
                }

                let userDoc = talkDoc.collection("users").doc(userData["userId"]) ;

                userDoc.update(userData) ;
            }
        }
    }); 

    let result = {} ;

    result["result"] = true ;

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));	
})) ;

// deleteUnusedDevices
router.post('/deleteUnusedDevices', wrap(async function(req, res, next) {
    let key = req.body["key"] ;

    if (key != process.env.API_KEY) {
        let result = {} ;

        result["result"] = false ;
    
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));	

        return ;
    }

    let timestamp = Date.now() ;

    let talksDoc = admin.firestore().collection("talks")

    let talksSnapshot = await talksDoc.get() ;
    
    talksSnapshot.forEach(async talkSnapshot => {
      
        let talkData = talkSnapshot.data() ;

        const prevUserCount = Number(talkData["userCount"]) ;

        let talkDoc = await talksDoc.doc(talkSnapshot.id) ;
        let usersDoc = talkDoc.collection("users") ;

        let usersSnapshot = await usersDoc.get() ;
        let enableDeviceCount = 0 ;

        usersSnapshot.forEach(async userSnapshot => {
            let userData = userSnapshot.data() ;

            if ((timestamp - 120 * 60 * 1000) > userData["timestamp"]) {
                let userDoc = await usersDoc.doc(userSnapshot.id) ;
                await userDoc.delete() ;
            } else {
                enableDeviceCount++ ;
            }
        }) ;

        if (enableDeviceCount <= 0) {
            console.log("delete this talkId : " + talkSnapshot.id) ;
            await talkDoc.delete() ;
        } else {     
            if (prevUserCount != enableDeviceCount) {
                console.log("update this talkId : " + talkSnapshot.id) ;
                await talkDoc.set({"userCount" :enableDeviceCount}) ;
            }
        }
    }) ;

    let result = {} ;

    result["result"] = true ;

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));	
})) ;

router.post('/pushRemoteNotificationDirectly', wrap(async function(req, res, next) {
    let userData = {} ;

    userData["deviceToken"] = req.body["deviceToken"] ;
    userData["env"] == "pro" ;
    userData["languageCode"] = req.body["languageCode"] ;
    userData["type"] = req.body["type"] ;

    sendPushNotification(
        userData["deviceToken"], 
        userData["env"] == "pro", 
        userData["languageCode"],
        bundleId,
        userData["type"]) ;

    let result = {} ;

    result["result"] = true ;

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));	
})) ;

// sendPushNotification
function sendPushNotification(
    deviceToken, 
    production, 
    languageCode,
    bundleId,
    type
    ) {
    var options = {
        token: {
          key: process.env.APPLE_APNS_AUTH_KEY,
          keyId: process.env.APPLE_KEY_ID,
          teamId: process.env.APPLE_TEAM_ID,
        },
        production: production
    };

    var apnProvider = new apn.Provider(options);

    var note = new apn.Notification();
    
    apn.Notification.prototype.headers = function headers() {
        let headers = {};
        
        if (this.priority !== 10) {
            headers["apns-priority"] = this.priority;
        }
        
        if (this.id) {
            headers["apns-id"] = this.id;
        }
        
        if (this.expiry >= 0) {
            headers["apns-expiration"] = this.expiry;
        }
        
        if (this.topic) {
            headers["apns-topic"] = this.topic;
        }

        if (this.pushType) {
            headers["apns-push-type"] = this.pushType
        }
        
        if (this.collapseId) {
            headers["apns-collapse-id"] = this.collapseId;
        }
        
        return headers;
    };
    
    let message ;

    if (languageCode.startsWith("ja-")) {
        if (type == "iOS") {
            message = "" ;
        } else if (type == "watchOS" || type == "watchOS_via_iOS") {
            message = "Apple Watchで" ;
        } else {
            message = "" ;
        }

        message += "参加しているトークに新しい発話がありました。" ;
    } else {
        message = "Your joined talks had new messages" ;

        if (type == "iOS") {
            message = "." ;
        } else if (type == "watchOS" || type == "watchOS_via_iOS") {
            message = " on Apple Watch." ;
        } else {
            message = "." ;
        }
    }
    
    note.badge = 0;
    note.body = message ;
    note.topic = bundleId;
    note.sound = "ping.aiff";
    note.pushType = "alert" ;
    note.contentAvailable = true;
    note.priority = 5;

    apnProvider.send(note, deviceToken).then( (result) => {
        console.log(bundleId + " : " + deviceToken) ;
        console.log(result) ;
    });
}

// sendFCM
function sendFCM(
    deviceToken, 
    languageCode) 
{

    let title = "" ;
    let body = "" ;

    if (languageCode.startsWith("ja-")) {
        title = "UDトーク" ;
        body = "参加しているトークに新しい発話がありました。" ;
    } else {
        title = "UDTalk" ;
        body = "Your joined talks had new messages" ;
    }

    const message = {
        notification: {
            title: title,
            body: body
        },
        token: deviceToken
    };
    
    admin.messaging().send(message).then((response) => {
        console.log('Successfully sent message:', response);
    }).catch((error) => {
        console.log('Error sending message:', error);
    });
}

module.exports = router;