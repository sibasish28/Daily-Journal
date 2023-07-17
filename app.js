const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const catchAsync = require('./CatchAsync');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const User = require('./models/user');
const flash = require('connect-flash');
const LocalStrategy = require('passport-local');
const methodOverride = require('method-override');
require('dotenv').config();
const dbUrl= process.env.DB_URL;
const MongoDBStore = require("connect-mongo")(session);
const app = express();


app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(methodOverride('_method'));

mongoose.connect(String(dbUrl));

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
  console.log("Database connected");
});

const postSchema = {
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
};

const Post = mongoose.model("Post", postSchema);

const secret=process.env.SECRET;

const store = new MongoDBStore({
  url: dbUrl,
  secret,
  touchAfter: 24 * 60 * 60
});

store.on("error", function (e) {
  console.log("SESSION STORE ERROR", e)
})
const sessionConfig = {
  store,
  name:"session",
  secret,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}

app.use(session(sessionConfig))
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  console.log(req.session)
  res.locals.currentUser = req.user;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
})

const isLoggedIn = (req, res, next) => {
  if (!req.isAuthenticated()) {
    req.session.returnTo = req.originalUrl
    req.flash('error', 'You must be signed in first!');
    res.redirect('/login');
  }
  next();
}

app.get('/register', catchAsync((req, res) => {
   res.render('register');
}));

app.post('/register', catchAsync(async (req, res, next) => {
  try {
    const { email, username, password } = req.body;
    const user = new User({ email, username });
    const registeredUser = await User.register(user, password);
    req.login(registeredUser, err => {
      if (err) return next(err);
      req.flash('success', 'Welcome to Blog Journal!');
      res.redirect('/home');
    })
  } catch (e) {
    req.flash('error', e.message);
    res.redirect('register');
  }
}));

app.get('/login', catchAsync((req, res) => {
  res.render('login');
}));

app.post('/login', passport.authenticate('local', { failureFlash: true, failureRedirect: '/login' }), (req, res) => {
  req.flash('success', `welcome back ${req.user.username}!`);
  delete req.session.returnTo;
  res.redirect('/home');
})

app.get('/logout', (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    req.flash('success', 'Goodbye!');
    res.redirect('/');
  });
})

app.get("/", catchAsync(async function (req, res) {
  res.render("start");
}));

app.get("/home", isLoggedIn, catchAsync(async function (req, res) {
  const author = await User.findById(req.user._id).populate('posts');
  res.render("home", {
    posts: author.posts
  });
}));


app.get("/compose", isLoggedIn, catchAsync(function (req, res) {
  res.render("compose");
}));

app.post("/compose", isLoggedIn, catchAsync(async function (req, res) {
  const post = new Post({
    title: req.body.postTitle,
    content: req.body.postBody,
    author: req.user._id
  });
  const author = await User.findById(req.user._id);
  author.posts.push(post);
  await post.save();
  await author.save();
  res.redirect("/home");

}));


app.get("/posts/:postId", isLoggedIn, catchAsync(async function (req, res) {

  const requestedPostId = req.params.postId;

  const post = await Post.findOne({ _id: requestedPostId, author: req.user._id });
  res.render("post", {
    title: post.title,
    content: post.content,
    id: post._id
  });
}));

app.get("/posts/:postId/edit", isLoggedIn, catchAsync(async function (req, res) {
  const post = await Post.findOne({ _id: req.params.postId, author: req.user._id });
  res.render("edit", { postID: post._id, content: post.content, title: post.title });
}));

app.put("/posts/:postId", isLoggedIn, catchAsync(async function (req, res) {
  const post = await Post.findOne({ _id: req.params.postId, author: req.user._id });
  post.title = req.body.postTitle;
  post.content = req.body.postBody;
  post.save();
  res.redirect(`/posts/${req.params.postId}`);
}));

app.delete("/posts/:postId", isLoggedIn, catchAsync(async function (req, res) {

  const requestedPostId = req.params.postId;

  const post = await Post.findOne({ _id: requestedPostId, author: req.user._id });
  Post.findByIdAndDelete(post._id);
  res.redirect('/');
}));


app.get("/about", function (req, res) {
  res.render("about");
});


app.use((err, req, res, next) => {
  const { statusCode = 500 } = err;
  if (!err.message) err.message = 'Oh No, Something Went Wrong!'
  return res.status(statusCode).render('error', { err })
})

app.listen(process.env.PORT, function () {
  console.log("Server started on port 3000");
});
