const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const mongoose = require('mongoose');
const handlebars = require('express-handlebars');
const cluster = require('cluster');
const log4js = require('log4js');
const nodemailer = require('nodemailer');

const app = express();

const User = require('./db/model');

const numCPUs = require('os').cpus().length;

/* -------------- Datos por CL -------------- */

const portCL = process.argv[2] || 5504;
const FACEBOOK_APP_ID = process.argv[3] || '494152521729245'; // 
const FACEBOOK_APP_SECRET = process.argv[4] || '00000000000000000'; // 
const modoCluster = process.argv[5] == 'CLUSTER';


/* -------------- PASSPORT w FACEBOOK -------------- */
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;

/* -------------- EMAIL & SMS -------------- */

// ethereal

const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
        user: 'clovis.kris@ethereal.email',
        pass: 'XV2WSN8xc6KzP7bXnF'
    }
});

const enviarEthereal = (asunto, mensaje) => {
    const mailOptions ={
        from: 'Servidor Node.js',
        to: 'clovis.kris@ethereal.email',
        subject: asunto,
        html: mensaje
    }

    transporter.sendMail(mailOptions, (err, info) => {
        if(err) {
            console.log(err);
        }
        else console.log(info);
    })
}

// ------- 
//gmail

const transporterG = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'backend.sawin@gmail.com',
        pass: 'Wednesday#02'
    }
});

const enviarGmail = (asunto, mensaje, adjunto, to) => {
    const mailOptions ={
        from: 'Servidor Node.js',
        to: to,
        subject: asunto,
        html: mensaje, 
        attachments: [
            {
                path: adjunto,
                filename: 'profile.jpg',
            }
        ]
    }

    transporterG.sendMail(mailOptions, (err, info) => {
        if(err) {
            console.log(err);
        }
        else console.log(info);
    })
}

// ------- 
// twilio

const accountSid = 'AAAAAAAAAAAAAAAAA';
const authToken = '999999999999999999';

const twilio = require('twilio');

const client = twilio(accountSid, authToken);

const enviarSMS = (mensaje) => { 
    let rta = client.messages.create({
            body: mensaje, 
            from: '+12566009360',
            to: '+54111234567'
    })
    return rta;   
}

/* -------------- LOGGERS -------------- */
log4js.configure({
    appenders: {
        miLoggerConsole: {type: "console"},
        miLoggerFileWarning: {type: 'file', filename: 'warn.log'},
        miLoggerFileError: {type: 'file', filename: 'error.log'}
    },
    categories: {
        default: {appenders: ["miLoggerConsole"], level:"trace"},
        info: {appenders: ["miLoggerConsole"], level: "info"},
        warn: {appenders:["miLoggerFileWarning"], level: "warn"},
        error: {appenders: ["miLoggerFileError"], level: "error"}
    }
});

const loggerInfo = log4js.getLogger('info');
const loggerWarn = log4js.getLogger('warn');
const loggerError = log4js.getLogger('error');

/* -------------------------------------------- */
/* MASTER */

if(modoCluster && cluster.isMaster) {
    // if Master, crea workers

    loggerInfo.info(`Master ${process.pid} is running`);

    // fork workers
    for (let i=0; i<numCPUs; i++){
        cluster.fork();
    };

    cluster.on('exit', (worker) => {
        loggerInfo.info(`Worker ${worker.process.pid} died`);
    });
} else {
    // if !Master, alta al servidor + resto funcionalidades

    passport.use(new FacebookStrategy({
        clientID: FACEBOOK_APP_ID, 
        clientSecret: FACEBOOK_APP_SECRET,
        callbackURL: '/auth/facebook/callback',
        profileFields: ['id', 'displayName', 'photos', 'emails'],
        scope: ['email']
    }, function(accessToken, refreshToken, profile, done) {
        let userProfile = profile;
    
        return done(null, userProfile);
    }));

    /* -------------- serialize + deserialize -------------- */
    passport.serializeUser(function(user, cb) {
        cb(null, user);
    });

    passport.deserializeUser(function(obj, cb) {
        cb(null, obj);
    });

    /* ------------------------------------ */
    /* CONFIG */
    app.use(express.json());
    app.use(express.urlencoded({extended:true}));

    app.use(cookieParser());
    app.use(session({
        secret: 'secret',
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            maxAge: 60000
        }
    }));


    app.engine(
        "hbs", 
        handlebars({
            extname: ".hbs",
            defaultLayout: 'index.hbs',
        })
    );


    app.set("view engine", "hbs");
    app.set("views", "./views");

    app.use(express.static('public'));
    app.use(passport.initialize());
    app.use(passport.session());

    /* -------------- LOGIN -------------- */
    app.get('/login', (req, res)=>{
        if(req.isAuthenticated()){
            res.render("welcome", {
                nombre: req.user.displayName,
                foto: req.user.photos[0].value,
                email: req.user.emails[0].value,
                contador: req.user.contador
            })
        }
        else {
            res.sendFile(process.cwd() + '/public/login.html')
        }
    })

    app.get('/auth/facebook', passport.authenticate('facebook'));
    app.get('/auth/facebook/callback', passport.authenticate('facebook',
        {
            successRedirect: '/welcome',
            failureRedirect: '/faillogin'
        }
    ));

    app.get('/enviarSMS', (req, res) => {
        let date = new Date().toLocaleString();
        let mensaje = `Están intentando iniciar sesión el día ${date}`;

        let rta = enviarSMS(mensaje);
        res.send(rta);
    })

    app.get('/welcome', (req, res) => {

        res.redirect('/login-email');
    });

    app.get('/login-email', (req, res) => {
        let nombre = req.user.displayName;
        let foto = req.user.photos[0].value;
        let email = req.user.emails[0].value;

        let date = new Date().toLocaleString();

        let asunto = 'Logged in';
        let mensaje = `El usuario ${nombre} inició sesión el día ${date}`;


        // ethereal 
        enviarEthereal(asunto, mensaje);
        // gmail
        enviarGmail(asunto, mensaje, foto, email);

        res.redirect('/');
                
    })


    app.get('/faillogin', (req, res) => {
        res.render('login-error', {});
    });

    app.get('/logout', (req, res)=>{
        let nombre = req.user.displayName;
        let date = new Date().toLocaleString();

        // ethereal

        let asunto = 'Logged out';
        let mensaje = `El usuario ${nombre} cerró sesión el día ${date}`;

        enviarEthereal(asunto, mensaje);

        req.logout();
        res.render("logout", { nombre });
        
    });

    /* -------------- GLOBAL PROCESS & CHILD PROCESS -------------- */

    // PROCESS
    app.get('/info', (req, res) => {

        let info = {
            rgEntrada: JSON.stringify(process.argv, null, '\t'), 
            os: process.platform, 
            nodeVs: process.version, 
            memoryUsage: JSON.stringify(process.memoryUsage()), 
            excPath: process.execPath, 
            processID: process.pid, 
            folder: process.cwd(),
            numCPUs
        };

        // test
        console.log(info);

        res.render("info", info);
    });

    /* -------------- DB CONNECTION -------------- */

    app.listen( process.env.PORT|| portCL, ()=>{
        loggerInfo.info(`Running on PORT ${portCL} - PID WORKER ${process.pid}`);
        mongoose.connect('mongodb://localhost:27017/ecommerce', 
            {
                useNewUrlParser: true, 
                useUnifiedTopology: true
            }
        )
            .then( () => loggerInfo.info('Base de datos conectada') )
            .catch( (err) => loggerError.error(err) );
    })

    loggerInfo.info(`Worker ${process.pid} started`);
};
