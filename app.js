const express = require('express');
const axios = require('axios');
const winston = require('winston');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Use Morgan middleware for logging requests
app.use(morgan('combined', { stream: { write: (message) => logger.info(message) } }));

// Custom middleware to log response after it has been sent
app.use((req, res, next) => {
  const originalSend = res.send;

  res.send = function (body) {
    logger.info(`Sent response for ${req.method} ${req.originalUrl}: ${body}`);
    originalSend.call(this, body);
  };

  next();
});

app.get('/best-stories/:n?', async (req, res) => {
  try {
    const n = req.params.n || 5; // Default to 5 if not specified
    
    // Error if n is not defined and not mandatory
    // if (!req.params.n) {
    //   logger.error('Number of stories (n) is not specified. Please provide the number of stories to retrieve.');
    //   return res.status(400).json({ error: 'Number of stories (n) is not specified. Please provide the number of stories to retrieve.' });
    // }

    const bestStoryIds = await axios.get('https://hacker-news.firebaseio.com/v0/beststories.json');
    const topNIds = bestStoryIds.data.slice(0, n);

    const storyDetailsPromises = topNIds.map(id =>
      axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    );

    const stories = await Promise.all(storyDetailsPromises);

    const formattedStories = stories.map(story => ({
      title: story.data.title,
      uri: story.data.url,
      postedBy: story.data.by,
      time: new Date(story.data.time * 1000).toISOString(),
      score: story.data.score,
      commentCount: story.data.descendants || 0,
    }));

    res.json(formattedStories);

    // Log the handled request
    logger.info(`Handled request for ${n} best stories`);
  } catch (error) {
    logger.error(`Error: ${error.message}`);

    // Check for specific error status codes
    if (error.response) {
      res.status(error.response.status).json({ error: error.response.statusText });
    } else if (error.request) {
      res.status(500).json({ error: 'No response received from the Hacker News API' });
    } else {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

app.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT}`);
});
