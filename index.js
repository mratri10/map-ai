import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";

dotenv.config();
const app = express();
app.use(express.json());

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true // if using cookies or auth headers
}));

const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

app.get("/info-place", async (req, res) => {
  try {
    const { name, category } = req.query;

  const prompt = `Please Generate Result list JSON Stringfy [{name,latitude (double), longitude (double), describe(string)}]
   for ${category} in Kota/Kabupaten ${name}, Indonesia. link image please take from google`;

  const aiRes = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
  });

  const aiText = aiRes.choices[0].message.content
  const aiParse = JSON.parse(aiText)

  const dataPlace = []

  if(!aiParse || aiParse.length == 0){
        return res.json({
            name,
            ai_describription: aiText,
        });
    }
  for (let i = 0; i < aiParse.length; i++) {
    const lat = aiParse[i].latitude
    const long = aiParse[i].longitude
    if(!lat || !long || lat <-11 || lat >6 || long<95 || long>141){
        continue;
    }
    const geoRes = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${long}&key=${GOOGLE_API_KEY}`
    );
    if (!geoRes.data.results.length) {
        console.error("Location not found", aiParse[i])
        continue;
    }
    const data = aiParse[i]
    
    const address = geoRes.data.results[0];
    data.address =address.formatted_address
    dataPlace.push(data)
  }
  return res.json(dataPlace);
  } catch (err) {
    console.error(err)
    return res.status(500).json({
        error:"Server Error"
    })
  }
});

app.post("/nearby-place", async (req, res)=>{
    try {
        const { lat, long, category,radius } = req.body;

        const nearby = await axios.post(
            `https://places.googleapis.com/v1/places:searchNearby`,
            {
                "includedTypes": [category],
                "maxResultCount": 10,
                "locationRestriction": {
                    "circle": {
                        "center": {
                            "latitude": lat,
                            "longitude": long
                        },
                        "radius": radius || 1000 // default radius 1000 meters
                    }
                }
            },{
                headers:{
                    "Content-Type":"application/json",
                    "X-Goog-Api-Key":GOOGLE_API_KEY,
                    "X-Goog-FieldMask": "places.displayName,places.location,places.photos"
                }
            }
        );
        return res.status(200).json({
            ...nearby.data
            })
    } catch (error) {
        console.log("err", error)
        return res.status(500).json({
            message: "Server Error"
        })
    }
})

app.post("/listSearch", async(req, res)=>{
    try {
        const  {address } = req.body
        const searchAddress= address.replace(" ", "+")
        const listAddress = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json?address=${searchAddress}&key=${GOOGLE_API_KEY}`)
        if(listAddress.data.results && listAddress.data.results>0){
            const dataList = listAddress.data.results
            return res.status(200).json({
                address: dataList
            })
        }else{
            return res.status(listAddress.status).json({
                message:"No Data",
                resp: listAddress.data,
            })
        }
        
    } catch (error) {
        return res.status(500).json({
            message:"Error: "+error.message
        })
    }
})

app.listen(process.env.PORT || 3050, () => {
  console.log(`Server running on Port ${process.env.PORT || 3050}`);
});
