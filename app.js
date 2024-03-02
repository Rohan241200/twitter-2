const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'twitterClone.db')
const app = express()
app.use(express.json())

let db = null
const initilizer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server starting at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error ${e.message}`)
    process.exit(1)
  }
}
initilizer()

const getUser = async username => {
  const getQuery = `
    SELECT following_user_id
    FROM follower INNER JOIN user
    ON user.user_id = follower.follower_user_id
    WHERE user.username = "${username}" ;
  `

  const followingQuery = await db.all(getQuery)
  const peopleArray = followingQuery.map(each => each.following_user_id)
  return peopleArray
}

// FIRST middler
const authFunction = (request, response, next) => {
  let jwtToken = null
  const header = request.headers['authorization']

  if (header !== undefined) {
    jwtToken = header.split(' ')[1]
  }

  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'My_Token', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.userId = 2
        request.username = payload.username
        console.log(payload)
        next()
      }
    })
  }
}

// SECOND middler
const tweetVerification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params

  const getTweetQuery = `
    SELECT *
    FROM tweet INNER JOIN follower
    ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';
  `

  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//API 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const userResp = await db.get(getUserQuery)

  if (userResp === undefined) {
    if (password.length >= 6) {
      const hashPass = await bcrypt.hash(password, 10)
      const newQuery = `
        INSERT INTO user
          (name , username , password , gender)
        VALUES (
            '${name}', 
            '${username}' , 
            '${hashPass}' , 
            '${gender}'
          );
      `
      const createUser = await db.run(newQuery)
      response.status(200)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

// API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectedQuery = `SELECT * FROM user WHERE username = '${username}' ;`
  const selectedResp = await db.get(selectedQuery)

  if (selectedResp === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const passMatch = await bcrypt.compare(password, selectedResp.password)
    if (passMatch === true) {
      const payload = {username: username, userId: selectedResp.userId}
      const jwtToken = jwt.sign(payload, 'My_Token')
      response.status(200)
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// API 3
app.get('/user/tweets/feed/', authFunction, async (request, response) => {
  const {username} = request

  const peopleId = await getUser(username)

  const getTweet = `
    SELECT username , tweet , date_time AS dateTime
    FROM user INNER JOIN tweet
    ON user.user_id = tweet.user_id
    WHERE user.user_id IN(${peopleId})
    ORDER BY date_time DESC
    LIMIT 4 ;
  `
  const tweetResp = await db.all(getTweet)
  response.send(tweetResp)
})

// API 4
app.get('/user/following/', authFunction, async (request, response) => {
  const {userId} = request

  const getQuery = `
    SELECT name 
    FROM follower INNER JOIN user
    ON user.user_id = follower.following_user_id
    WHERE follower_user_id = '${userId}';
   `
  const followingPeople = await db.all(getQuery)
  response.send(followingPeople)
})

// API 5
app.get('/user/followers/', authFunction, async (request, response) => {
  const {userId} = request

  const getQuery = `
    SELECT DISTINCT name 
    FROM follower INNER JOIN user
    ON user.user_id = follower.follower_user_id
    WHERE following_user_id = '${userId}' ;
  `
  const followersPeople = await db.all(getQuery)
  response.send(followersPeople)
})

//API 6
app.get(
  '/tweets/:tweetId/',
  authFunction,
  tweetVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const {userId, username} = request
    const followingQuery = `
    SELECT tweet , 
      (SELECT COUNT() FROM Like WHERE tweet_id = '${tweetId}')AS likes,
      (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}')AS replies , 
      date_time AS dateTime
    FROM tweet 
    WHERE tweet.tweet_id = ${tweetId} ;`
    const followingResp = await db.get(followingQuery)
    response.send(followingResp)
  },
)

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authFunction,
  tweetVerification,
  async (request, response) => {
    const {tweetId} = request.params

    const likeQuery = `
        SELECT username 
        FROM user INNER JOIN like 
        ON user.user_id = like.user_id
        WHERE tweet_id = ${tweetId} ;`
    const likeResp = await db.all(likeQuery)
    const userArray = likeResp.map(each => each.username)
    response.send({likes: userArray})
  },
)

// API 8
app.get(
  '/tweets/:tweetId/replies/',
  authFunction,
  tweetVerification,
  async (request, response) => {
    const {tweetId} = request.params

    const replyQuery = `
        SELECT name , reply
        FROM user INNER JOIN reply 
        ON user.user_id = reply.user_id
        WHERE tweet_id = ${tweetId} ;`
    const replyResp = await db.all(replyQuery)
    response.send({replies: replyResp})
  },
)

//API 9
app.get('/user/tweets/', authFunction, async (request, response) => {
  const {userId} = request

  const tweetQuery = `
    SELECT tweet.tweet,
      (SELECT DISTINCT like_id ) AS likes,
      (SELECT DISTINCT reply_id ) AS replies,
      date_time AS dateTIme
    FROM tweet LEFT JOIN reply 
    ON tweet.tweet_id = reply.reply_id 
      LEFT JOIN like 
      ON  tweet.tweet_id = like.tweet_id
    WHERE tweet.tweet_id = '${userId}'
    GROUP BY tweet.tweet_id;
    `
  const tweetResp = await db.all(tweetQuery)
  response.send(tweetResp)
})

//API 10
app.post('/user/tweets/', authFunction, async (request, response) => {
  const {tweet} = request.body
  const {userId} = request
  const id = parseInt(userId)

  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')

  const tweetQuery = `
    INSERT INTO tweet(tweet , user_id , date_time) 
    VALUES('${tweet}' , '${id}' , '${dateTime}') ;`
  await db.run(tweetQuery)
  response.send('Created a Tweet')
})

//API 11
app.delete('/tweets/:tweetId/', authFunction, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request

  const getTweetQu = `SELECT * FROM tweet WHERE tweet_id = '${tweetId}';`
  const tweetQu = await db.get(getTweetQu)

  if (tweetQu === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deleteQuery = `
        DELETE FROM tweet
        WHERE tweet_id = '${tweetId}' ;`
    await db.run(deleteQuery)
    response.send('Tweet Removed')
  }
})

module.exports = app
