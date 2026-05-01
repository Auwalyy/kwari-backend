import mongoose from 'mongoose'

const StoreSchema = new mongoose.Schema({
    traderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    storeName: {
        type: String,
        required: true,
    },
    storeImage: {
        type: String,
    },
    storeDescription: {
        type: String,
    },
    storeLocation: {
        type: String,
        required: true,
    },
    storePhoneNumber: {
        type: String,
        required: true,
    },
    rating: {
avg:   { Number, default: 0, min: 0, max: 5 },
count: { Number, default: 0 },
total: { Number, default: 0 }  
},
responseRate:  { Number, default: 0 } , // % updated nightly by job
plan:          { String, default: "free", enum: [free, pro] },
planExpiresAt: { Date }   ,
productCount:  { Number, default: 0 },   //maintained by $inc, avoids COUNT queries
    isVerified: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    }
})