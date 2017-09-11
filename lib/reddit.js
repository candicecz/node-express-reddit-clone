"use strict";

var bcrypt = require('bcrypt-as-promised');
var HASH_ROUNDS = 10;

// This is a helper function to map a flat post to nested post
function transformPost(post) {
    return {
        id: post.posts_id,
        title: post.posts_title,
        url: post.posts_url,
        createdAt: post.posts_createdAt,
        updatedAt: post.posts_updatedAt,
        voteScore: post.voteScore,
        numUpvotes: post.numUpvotes,
        numDownvotes: post.numDownvotes,

        user: {
            id: post.users_id,
            username: post.users_username,
            createdAt: post.users_createdAt,
            updatedAt: post.users_updatedAt
        },
        subreddit: {
            id: post.subreddits_id,
            name: post.subreddits_name,
            description: post.subreddits_description,
            createdAt: post.subreddits_createdAt,
            updatedAt: post.subreddits_updatedAt
        }
    };
}

class RedditAPI {
    constructor(conn) {
        this.conn = conn;
    }

    /*
    user should have username and password
     */
    createUser(user) {
        /*
         first we have to hash the password. we will learn about hashing next week.
         the goal of hashing is to store a digested version of the password from which
         it is infeasible to recover the original password, but which can still be used
         to assess with great confidence whether a provided password is the correct one or not
         */
        return bcrypt.hash(user.password, HASH_ROUNDS)
        .then(hashedPassword => {
            return this.conn.query('INSERT INTO users (username, password, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())', [user.username, hashedPassword]);
        })
        .then(result => {
            return result.insertId;
        })
        .catch(error => {
            // Special error handling for duplicate entry
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('A user with this username already exists');
            }
            else {
                throw error;
            }
        });
    }

    /*
    post should have userId, title, url, subredditId
     */
    createPost(post) {
        if (!post.subredditId) {
            return Promise.reject(new Error("There is no subreddit id"));
        }

        return this.conn.query(
            `
                INSERT INTO posts (userId, title, url, createdAt, updatedAt, subredditId)
                VALUES (?, ?, ?, NOW(), NOW(), ?)`,
            [post.userId, post.title, post.url, post.subredditId]
        )
        .then(result => {
            return result.insertId;
        });
    }

    getAllPosts(queryObj) {//was subredditI
        var query =
            `
            SELECT
                p.id AS posts_id,
                p.title AS posts_title,
                p.url AS posts_url,
                p.createdAt AS posts_createdAt,
                p.updatedAt AS posts_updatedAt,


                u.id AS users_id,
                u.username AS users_username,
                u.createdAt AS users_createdAt,
                u.updatedAt AS users_updatedAt,

                s.id AS subreddits_id,
                s.name AS subreddits_name,
                s.description AS subreddits_description,
                s.createdAt AS subreddits_createdAt,
                s.updatedAt AS subreddits_updatedAt,

                COALESCE(SUM(v.voteDirection), 0) AS voteScore,
                SUM(IF(v.voteDirection = 1, 1, 0)) AS numUpvotes,
                SUM(IF(v.voteDirection = -1, 1, 0)) AS numDownvotes

                FROM posts p
                JOIN users u ON p.userId = u.id
                JOIN subreddits s ON p.subredditId = s.id
                LEFT JOIN votes v ON p.id = v.postId`;


        //if there is a username
        if(queryObj.username!==null){
            query += ` WHERE users.username = ${queryObj.username}`;
        }
        //if there is a subreddit id
        if(queryObj.subredditId !== null){
          query += ` WHERE p.subredditId = ${queryObj.subredditId}`;
        }
          query += ` GROUP BY p.id`;
        //if we are sorting by top vote
        if(queryObj.sortingMethod === 'top'){
          query += ` ORDER BY voteScore DESC`;
        }
        //if we are sorting by hot vote
        else if(queryObj.sortingMethod === 'hot'){
          query += ` ORDER BY COALESCE(SUM(v.voteDirection), 0) / NOW() - p.createdAt`;
        }
        //if we are not sorting
        else if(queryObj.sortingMethod === null){
          query += ` ORDER BY p.createdAt DESC`;
        }
        query += ` LIMIT 25`;

          //query+= ` ORDER BY p.createdAt DESC`;
        return this.conn.query(query)
        .then(function(posts) {
            return posts.map(transformPost)
        });
    }

    // Similar to previous function, but retrieves one post by its ID
    getSinglePost(postId) {
        return this.conn.query(
            `
            SELECT
                p.id AS posts_id,
                p.title AS posts_title,
                p.url AS posts_url,
                p.createdAt AS posts_createdAt,
                p.updatedAt AS posts_updatedAt,

                u.id AS users_id,
                u.username AS users_username,
                u.createdAt AS users_createdAt,
                u.updatedAt AS users_updatedAt,

                s.id AS subreddits_id,
                s.name AS subreddits_name,
                s.description AS subreddits_description,
                s.createdAt AS subreddits_createdAt,
                s.updatedAt AS subreddits_updatedAt,

                COALESCE(SUM(v.voteDirection), 0) AS voteScore,
                SUM(IF(v.voteDirection = 1, 1, 0)) AS numUpvotes,
                SUM(IF(v.voteDirection = -1, 1, 0)) AS numDownvotes

            FROM posts p
                JOIN users u ON p.userId = u.id
                JOIN subreddits s ON p.subredditId = s.id
                LEFT JOIN votes v ON p.id = v.postId

            WHERE p.id = ?`,
            [postId]
        )
        .then(function(posts) {
            if (posts.length === 0) {
                return null;
            }
            else {
                return transformPost(posts[0]);
            }
        });
    }

    /*
    subreddit should have name and optional description
     */
    createSubreddit(subreddit) {
        return this.conn.query(
            `INSERT INTO subreddits (name, description, createdAt, updatedAt)
            VALUES(?, ?, NOW(), NOW())`, [subreddit.name, subreddit.description])
        .then(function(result) {
            return result.insertId;
        })
        .catch(error => {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('A subreddit with this name already exists');
            }
            else {
                throw error;
            }
        });
    }

    getAllSubreddits() {
        return this.conn.query(`
            SELECT id, name, description, createdAt, updatedAt
            FROM subreddits ORDER BY createdAt DESC`
        )
    }

    /*
    vote must have postId, userId, voteDirection
     */
    createVote(vote) {

        if (vote.voteDirection !== 1 && vote.voteDirection !== -1 && vote.voteDirection !== 0) {
            return Promise.reject(new Error("voteDirection must be one of -1, 0, 1"));
        }

        return this.conn.query(`
            INSERT INTO votes (postId, userId, voteDirection, createdAt, updatedAt)
            VALUES (?, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE voteDirection = ?`,
            [vote.postId, vote.userId, vote.voteDirection, vote.voteDirection]
        );

    }

    /*
    comment must have userId, postId, text
     */
    createComment(comment) {
        return this.conn.query(`
            INSERT INTO comments (userId, postId, text, createdAt, updatedAt)
            VALUES (?, ?, ?, NOW(), NOW())`,
            [comment.userId, comment.postId, comment.text]
        )
        .then(result => {
            //console.log(result.insertId, "insert")
            return result.insertId;
        });
    }

    getCommentsForPost(postId) {
        return this.conn.query(`
            SELECT
                c.id as comments_id,
                c.text as comments_text,
                c.createdAt as comments_createdAt,
                c.updatedAt as comments_updatedAt,

                u.id as users_id,
                u.username as users_username

            FROM comments c
                JOIN users u ON c.userId = u.id

            WHERE c.postId = ?
            ORDER BY c.createdAt DESC
            LIMIT 25`,
            [postId]
        )
        .then(function(results) {
            return results.map(function(result) {
                return {
                    id: result.comments_id,
                    text: result.comments_text,
                    createdAt: result.comments_createdAt,
                    updatedAt: result.comments_updatedAt,

                    user: {
                        id: result.users_id,
                        username: result.users_username
                    }
                };
            });
        });
    }

//Checks to see if the user login info(username, password) is correct
checkUserLogin(username, password) {
      // if(username.length === 0) {
      //   console.log('error')
      //   return new Error("username is not defined");
      // }
      return this.conn.query(
        `SELECT id, username, password, createdAt, updatedAt FROM users where users.username = ?`, [username]
      ).then(results => {
          if(results.length === 0){
            return Promise.reject(new Error("username or password incorrect"));
          }
          else{
            return bcrypt.compare(password,results[0].password)
            .then(function(result){
              if(result){
                var userObj = {
                  id: results[0].id,
                  username: results[0].username,
                  createdAt: results[0].createdAt,
                  updatedAt: results[0].updatedAt
                }
                return userObj; //where results is the entire user object
              }
            })
          }
      }).catch(function(error){
          console.log(error, "Username or Password Incorrect");
          return error;
      });
    }
//Creates a user session when the user signs in
    createUserSession(userId){
      return bcrypt.genSalt(HASH_ROUNDS)
      .then(sessionId => {
        return this.conn.query(
          `INSERT INTO sessions (userId, token) VALUES (?,?)`, [userId,sessionId])
      })
      .then(result => {
        return this.conn.query(`
          SELECT id, userId, token
          FROM sessions
          WHERE sessions.userId = ?
          `, [userId])
      })
      .then(sessionData => {
        var session = {
          id: sessionData[0].id,
          userId: userId,
          sessionCookie: sessionData[0].token
        }
        return session;
      })
    }

//Gets the user info
    getUserFromSession(sessionId) {
      return this.conn.query(`
        SELECT users.id, users.username, sessions.token
        FROM users
        JOIN sessions
        ON users.id = sessions.userId
        WHERE sessions.token = ?
        `, [sessionId])
      .then(sessionInfo => {
        var userSession = {
          id:sessionInfo[0].id,
          username:sessionInfo[0].username,
          sessionCookie:sessionId
        }
        return userSession;
      })
    }
//Get subreddit name and return a subreddit id
  getSubredditByName(name){
    return this.conn.query(`
      SELECT id, name, description
      FROM subreddits
      WHERE subreddits.name = ?
      `, [name])
      .then(subredditInfo => {
        if(subredditInfo.length === 0){
          return null;
        }
        else{
          var subreddit = {
            id: subredditInfo[0].id,
            name: name,
            description: subredditInfo[0].description
          }
        return subreddit;
      }
      })
  }
    //get all posts for a given user
    //FINISH THIS TO MIMIC ABOVE
  // getAllPostsForUsername(username){
  //   return this.conn.query (`
  //     SELECT posts.id, users.username, posts.title, posts.userId, posts.subredditId, posts.url, posts.createdAt
  //     FROM posts
  //     LEFT JOIN users
  //     ON users.id = userId
  //     WHERE users.username = ?
  //     `, [username])
  // }
  // .then(subredditInfo => {
  //   if(subredditInfo.length === 0){
  //     return null;
  //   }
  //   else{
  //     var subreddit = {
  //       id: subredditInfo[0].id,
  //       name: name,
  //       description: subredditInfo[0].description
  //     }
  //   return subreddit;
  // }
  // })

}

module.exports = RedditAPI;
