const express = require("express");
var router = express.Router();

// Load the AWS SDK for Node.js
var AWS = require("aws-sdk");
var checksum = require("checksum");
const { v4: uuidv4 } = require("uuid");

require("dotenv").config();


AWS.config.update({
  region: "ap-southeast-2"
});

const redis = require("redis");
const client = redis.createClient({
  url: "redis://n10942297-assignment2.km2jzi.ng.0001.apse2.cache.amazonaws.com"
});
client
  .connect()
  .then(async (res) => {
    console.log('connected')
  });


// Starting the client, CreatingS3 service object
s3 = new AWS.S3({ apiVersion: "2006-03-01", signatureVersion: "v4" });

// Create the parameters for calling createBucket
const bucketname = "n10942297-assignment2";

const T = require("node-tesseract-ocr");

async function convertToText(url) {
  let imgText = await T.recognize(url);
  let results = imgText;
  return results;
}


router.get("/", function (req, res, next) {
  res.render("index");
});



router.post("/processimage", async (req, res) => {
  //The array of processed text that will be send to the front end
  let textArray = [];
  console.log(textArray);

  //Getting the UUID for each image
  console.log(req.body.keyArray);

  for (let i = 0; i < req.body.keyArray.length; i++) {
    const params = {
      Bucket: bucketname,
      Key: req.body.keyArray[i], //filename
    };

    // //MAKING THE URL from each object for transformation
    let s3link = s3.getSignedUrl("getObject", {
      Bucket: bucketname,
      Key: req.body.keyArray[i], //filename
      Expires: 6000, //time to expire in seconds
    });

    //Creating Checksum to see if image has been processed already
    let response = await s3.getObject(params).promise();
    let hashImage = checksum(response.Body);

    //Checking redis
    let hash = await client.get(hashImage);

    console.log(hashImage);

    //IF NOT FOUND
    if (hash == null) {
      console.log("Not found in redis");

      //Check if the text in S3
      const textParams = { Bucket: bucketname, Key: hashImage };

      try {
        const s3Result = await s3.getObject(textParams).promise();
        const s3JSON = JSON.parse(s3Result.Body);
        // if found in s3 get text from S3
        textArray.push(s3JSON.text);

        console.log(s3JSON.text);
        console.log("found in s3");
        //store text to redis
        client.set(hashImage, s3JSON.text.toString());
        console.log(`Successfully uploaded data to redis`);
      } catch (err) {

        //if not found in s3
        if (err.statusCode === 404) {
          //Converting text
          let convetedText = await convertToText(s3link);

          //Setting processed text to redis
          client.set(hashImage, convetedText.toString());

          //upload text to s3
          const body = JSON.stringify({ text: convetedText.toString() });
          const objectParams = {
            Bucket: bucketname,
            Key: hashImage,
            Body: body,
          };
          await s3.putObject(objectParams).promise();
          console.log("from tessearct");
          console.log(`Successfully uploaded data to s3`);
          //Pushing to array for front end
          textArray.push(convetedText);
        }
      }

      //Deleteing file from bucket
      try {
        await s3.deleteObject(params).promise();
        console.log("file deleted Successfully");
      } catch (err) {
        console.log("ERROR in file Deleting : " + JSON.stringify(err));
      }

      //IF FOUND in redis
    } else {
      console.log("Found in redis!!!");

      //Pushing processed text from redis frontend
      textArray.push(hash);
      //Deleteing file from bucket
      try {
        await s3.deleteObject(params).promise();
        console.log("file deleted Successfully");
      } catch (err) {
        console.log("ERROR in file Deleting : " + JSON.stringify(err));
      }
    }
  }

  console.log(textArray);
  // //RENDER TO FRONT END
  res.json(textArray);

});

// Code referenced from -> https://github.com/Sam-Meech-Ward/s3-direct-upload/blob/master/back/s3.js

router.get("/s3upload", async (req, res, next) => {
  let uploadURL = s3.getSignedUrl("putObject", {
    Bucket: bucketname,
    Key: uuidv4(), //filename
    Expires: 6000, //time to expire in seconds
  });

  res.json(uploadURL);
});

