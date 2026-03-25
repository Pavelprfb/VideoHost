require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

const app = express()

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.set("view engine","ejs")

// uploads folder auto create (Render fix)
const uploadDir = path.join(__dirname,"uploads")
if(!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir)
}

// static videos
app.use("/videos", express.static(uploadDir))

// MongoDB connect (default URI from .env)
if(process.env.MONGO_URI){
    mongoose.connect(process.env.MONGO_URI)
    .then(()=>console.log("MongoDB Connected"))
    .catch(err=>console.log(err))
}

// Schema
const videoSchema = new mongoose.Schema({
    title:String,
    filename:String,
    url:String
},{timestamps:true})

const Video = mongoose.model("Video",videoSchema)

// filename clean
function cleanName(name){
    name = name.replace(/[0-9]/g,"")
    name = name.replace(/[^\w\s]/gi,"")
    name = name.trim().replace(/\s+/g,"_")
    return name.toLowerCase()
}

// get folder stats: size + total files
function getFolderStats(){
    let totalSize = 0
    let totalFiles = 0
    const files = fs.readdirSync(uploadDir)
    files.forEach(file => {
        const stats = fs.statSync(path.join(uploadDir,file))
        if(stats.isFile()){
            totalFiles++
            totalSize += stats.size
        }
    })
    return {
        size:(totalSize / 1024 / 1024).toFixed(2),
        files:totalFiles
    }
}

// multer
const storage = multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null,uploadDir)
    },
    filename:(req,file,cb)=>{
        let original = path.parse(file.originalname).name
        let clean = cleanName(original)
        let ext = path.extname(file.originalname)
        cb(null, clean + ext)
    }
})
const upload = multer({storage})

// Home page
app.get("/", async(req,res)=>{
    let videos = []
    try{
        videos = await Video.find().sort({_id:-1})
    }catch(e){}
    const stats = getFolderStats()
    res.render("index",{
        videos,
        folderSize:stats.size,
        totalFiles:stats.files
    })
})

// Connect MongoDB from input
app.post("/connect", async(req,res)=>{
    const uri = req.body.mongo
    try{
        await mongoose.disconnect()
        await mongoose.connect(uri)
        console.log("Mongo Connected:",uri)
    }catch(e){
        console.log(e)
    }
    res.redirect("/")
})

// Upload video
app.post("/upload", upload.single("video"), async(req,res)=>{
    const domain = req.protocol + "://" + req.get("host")
    const videoUrl = domain + "/videos/" + req.file.filename
    const video = new Video({
        title:req.file.filename,
        filename:req.file.filename,
        url:videoUrl
    })
    await video.save()
    res.redirect("/")
})

// Delete video
app.post("/delete/:id", async(req,res)=>{
    const video = await Video.findById(req.params.id)
    if(video){
        const filepath = path.join(uploadDir,video.filename)
        if(fs.existsSync(filepath)){
            fs.unlinkSync(filepath)
        }
        await Video.findByIdAndDelete(req.params.id)
    }
    res.redirect("/")
})

const axios = require("axios")

// Upload from URL
app.post("/upload-url", async (req, res) => {
    try {
        const videoUrl = req.body.videoUrl

        if (!videoUrl) return res.redirect("/")

        const response = await axios({
            method: "GET",
            url: videoUrl,
            responseType: "stream"
        })

        // filename generate
        let name = path.parse(videoUrl).name || "video"
        let clean = cleanName(name)
        let ext = path.extname(videoUrl) || ".mp4"

        const filename = clean + Date.now() + ext
        const filepath = path.join(uploadDir, filename)

        // stream save
        const writer = fs.createWriteStream(filepath)
        response.data.pipe(writer)

        writer.on("finish", async () => {
            const domain = req.protocol + "://" + req.get("host")
            const newUrl = domain + "/videos/" + filename

            const video = new Video({
                title: filename,
                filename: filename,
                url: newUrl
            })

            await video.save()
            res.redirect("/")
        })

        writer.on("error", (err) => {
            console.log(err)
            res.redirect("/")
        })

    } catch (err) {
        console.log(err)
        res.redirect("/")
    }
})

// Server start
app.listen(process.env.PORT,()=>{
    console.log("Server Running")
})