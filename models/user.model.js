import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['trader', 'employee', "customer", "admin"],
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    linkedStoreId:  { ObjectId, ref: Store },
    linkedTraderId: { ObjectId, ref: User },
    isActive: {
        type: Boolean,
        default: true
    },
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);

export default User;
