require('dotenv').config();

const firebase = require('firebase');
const admin = require('firebase-admin');
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const session = require('express-session');

const requestContext = require('./middleware/request-context');
const requestTimeout = require('./middleware/request-timeout');
const apiErrorHandler = require('./middleware/api-error-handler');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.MEASUREMENT_ID,
};

const normalizePrivateKey = (key) => (key ? key.replace(/\\n/g, '\n') : key);

const serviceAccount = {
  type: process.env.FIREBASE_ADMINSDK_type,
  project_id: process.env.FIREBASE_ADMINSDK_project_id,
  private_key_id: process.env.FIREBASE_ADMINSDK_private_key_id,
  private_key: normalizePrivateKey(process.env.FIREBASE_ADMINSDK_private_key),
  client_email: process.env.FIREBASE_ADMINSDK_client_email,
  client_id: process.env.FIREBASE_ADMINSDK_client_id,
  auth_uri: process.env.FIREBASE_ADMINSDK_auth_uri,
  token_uri: process.env.FIREBASE_ADMINSDK_token_uri,
  auth_provider_x509_cert_url: process.env.FIREBASE_ADMINSDK_auth_provider_x509_cert_url,
  client_x509_cert_url: process.env.FIREBASE_ADMINSDK_client_x509_cert_url,
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');

const app = express();

app.disable('x-powered-by');

const sessionOptions = {
	secret: process.env.SESSION_SECRET || 'change-me',
	resave: false,
	saveUninitialized: false,
	cookie: { maxAge: 60 * 60 * 24 * 7 * 1000 },
};

app.use(session(sessionOptions));

app.use(requestContext);
app.use(requestTimeout);

logger.token('traceId', (req) => req.traceId || '-');
app.use(logger(':traceId :method :url :status :response-time ms - :res[content-length]'));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/api', apiRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404, 'Not Found'));
});

app.use(apiErrorHandler);

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
