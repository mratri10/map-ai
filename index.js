import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());

// ✅ CORS harus di-apply PALING ATAS
app.use(cors({
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

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
    const { name, category } = req.query;
    const prompt = `Please Generate Result list JSON Stringfy [{name,latitude (double), longitude (double), describe(string)}]
      for ${category} in Kota/Kabupaten ${name}, Indonesia. link image please take from google`;

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

    return res.status(200).json(nearby.data);
  } catch (error) {
    console.log("err", error);
    return res.status(500).json({ message: "Server Error" });
  }
});

app.post("/listSearch", async (req, res) => {
  try {
    const { address } = req.body;
    const searchAddress = address.replace(/ /g, "+");

    const listAddress = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${searchAddress}&key=${GOOGLE_API_KEY}`
    );

    if (listAddress.data.results?.length > 0) {
      return res.status(200).json({ address: listAddress.data.results });
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
