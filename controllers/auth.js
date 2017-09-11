var express = require('express');

module.exports = function(myReddit) {
    var authController = express.Router();

    authController.get('/login', function(request, response) {
        response.render('login-form');
    });

    authController.post('/login', function(request, response) {
      myReddit.checkUserLogin(request.body.username,request.body.password)
      .then(userLogin => {
        return myReddit.createUserSession(userLogin.id)
      })
      .then(userSession => {
        response.cookie("SESSION", userSession.sessionCookie).redirect(302,'/')
      })
      .catch (error => {
        response.status(401).render('unauthorized')
      })
    });

    authController.get('/signup', function(request, response) {
      response.render('signup-form');//response is kinda like  a return so put things before it

    });

    authController.post('/signup', function(request, response) {
      if(!request.body.username || !request.body.password){
        return response.status(400).redirect(302,'/auth/signup');
      }
      else{
        myReddit.createUser({
            username: request.body.username,
            password: request.body.password
        });
      return response.redirect(302,'/auth/login');
      }
    });
    return authController;
}
