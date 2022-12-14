var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var apiRouter = require('./routes/api');

var app = express();

const session = require('express-session') ;

var session_opt = {
	secret: 'keyboard cat',
	resave: false,
	saveUninitialized: false,
	cookie: {maxAge: 60 * 60 * 24 * 7 * 1000},
} ;

app.use(session(session_opt)) ;

require('dotenv').config();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/api', apiRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// firebase settings
var firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.MEASUREMENT_ID
};

var firebase = require('firebase') ;

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

var admin = require("firebase-admin");

var serviceAccount = {
  "type": process.env.FIREBASE_ADMINSDK_type,
  "project_id": process.env.FIREBASE_ADMINSDK_project_id,
  "private_key_id": process.env.FIREBASE_ADMINSDK_private_key_id,
  "private_key": process.env.FIREBASE_ADMINSDK_private_key,
  "client_email": process.env.FIREBASE_ADMINSDK_client_email,
  "client_id": process.env.FIREBASE_ADMINSDK_client_id,
  "auth_uri": process.env.FIREBASE_ADMINSDK_auth_uri,
  "token_uri": process.env.FIREBASE_ADMINSDK_token_uri,
  "auth_provider_x509_cert_url": process.env.FIREBASE_ADMINSDK_auth_provider_x509_cert_url,
  "client_x509_cert_url": process.env.FIREBASE_ADMINSDK_client_x509_cert_url,
} ;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

module.exports = app;
