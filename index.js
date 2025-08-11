import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());

app.use(cors());

// ✅ Log request untuk debug
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});

const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// =======================
// Routes
// =======================
app.get("/info-place", async (req, res) => {
  try {
    const { name, category, placeType } = req.query;
    const prompt = `Please Generate Result list JSON Stringfy [{name,latitude (double), longitude (double)}]
      for ${category} in ${placeType} ${name}, Indonesia.`;

    const aiRes = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    });

    const aiText = aiRes.choices[0].message.content;
    const aiParse = JSON.parse(aiText);
    const dataPlace = [];

    if (!aiParse || aiParse.length === 0) {
      return res.json({ name, ai_description: aiText });
    }

    for (let place of aiParse) {
      const lat = place.latitude;
      const long = place.longitude;
      if (!lat || !long || lat < -11 || lat > 6 || long < 95 || long > 141) {
        continue;
      }
      const geoRes = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${long}&key=${GOOGLE_API_KEY}`
      );
      if (!geoRes.data.results.length) continue;

      place.address = geoRes.data.results[0].formatted_address;
      dataPlace.push(place);
    }

    return res.json(dataPlace);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server Error" });
  }
});

app.post("/nearby-place", async (req, res) => {
  try {
    const { lat, long, category, radius } = req.body;

    const nearby = await axios.post(
      `https://places.googleapis.com/v1/places:searchNearby`,
      {
        includedTypes: [category],
        maxResultCount: 30,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: long },
            radius: radius || 1000,
          },
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_API_KEY,
          "X-Goog-FieldMask": "places.displayName,places.location,places.photos",
        },
      }
    );

    return res.status(200).json(nearby.data);
  } catch (error) {
    console.log("err", error);
    return res.status(500).json({ message: "Server Error" });
  }
});

app.post("/listSearch", async (req, res) => {
  try {
    const { address, category, radius } = req.body;
    const searchAddress = address.replace(/ /g, "+");

    const listAddress = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${searchAddress}&key=${GOOGLE_API_KEY}`
    );

    if (listAddress.data.results?.length > 0) {
        const lat = listAddress.data.results[0].geometry.location.lat;
        const long = listAddress.data.results[0].geometry.location.lng;

        const nearby = await axios.post(
        `https://places.googleapis.com/v1/places:searchNearby`,
            {
                includedTypes: [category],
                maxResultCount: 10,
                locationRestriction: {
                circle: {
                    center: { latitude: lat, longitude: long },
                    radius: radius || 1000,
                },
                },
            },
            {
                headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_API_KEY,
                "X-Goog-FieldMask": "places.displayName,places.location,places.photos",
                },
            }
        );
        if(nearby){
            const promptPlace= []
            const photos = []
            for (let place of nearby.data.places) {
                const photoItem ={
                    id: place.location.latitude +"-"+ place.location.longitude,
                    photos: place.photos
                }
                photos.push(photoItem);
                delete place.photos;
                promptPlace.push(place)
            }
            const prompt = `Please Generate Result list JSON Stringfy [{name (string),latitude (double), longitude (double)
            , description (please tell history, created at or found at and story unique about this place), linkMaps (string)}] based on the data
            ${JSON.stringify(promptPlace)}.`;
            console.log("aiRes", prompt);
            const aiRes = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            });
            
            const aiText = aiRes.choices[0].message.content;
            const aiParse = JSON.parse(aiText);
            for (let place of aiParse) {
                const photo = photos.find(p => p.id === place.latitude + "-" + place.longitude);
                if (photo) {
                    place.photos = photo.photos;
                }
            }
            return res.status(200).json(aiParse);
        }else{
            return res.status(404).json({ message: "No Data", resp: nearby.data });
        }
      
    } else {
      return res.status(404).json({ message: "No Data", resp: listAddress.data });
    }
  } catch (error) {
    return res.status(500).json({ message: "Error: " + error.message });
  }
});

// =======================
// Start server
// =======================
app.listen(process.env.PORT || 3050, () => {
  console.log(`Server running on Port ${process.env.PORT || 3050}`);
});
