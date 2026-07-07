import require from "requirejs";
import crypto from 'crypto';
import * as Error from "../../core/errors/ErrorConstant.js";
import { PayloadCompiler } from "../../core/inc/access/PayloadCompiler.js";
import { authentications } from "../../core/utils/jwt.js";
import { NodeMailerfunction } from "../../core/utils/nodemailer.js";
import { messagingFunction } from "../../core/utils/msg91.js";
import { userDbController } from "../../core/database/Controller/userDbController.js";
import Razorpay from "razorpay";
var CryptoJS = require("crypto-js");
import dotenv from "dotenv";
import { addfavourites, deletereview, getwalletamount, initiaterefund, topsaloons } from "../controller/userappcontroller.js";
import { connection } from "../../core/database/connection.js";
import { sendBookingConfirmedNotifications } from "../../core/utils/bookingNotifications.js";
import axios from "axios";
import { formatNearbyStores, formatSalonList, formatTopSalons, formatSalonResponse, formatCouponResponse, formatReviewListV2 } from "../../core/services/ResponseFormatter.js";
import { broadcastNewBooking } from "../../core/utils/sseManager.js";
import { sendBookingConfirmedWhatsApp } from "../../core/utils/whatsappNotification.js";


const admin = require('firebase-admin');


dotenv.config();


const razorpay = new Razorpay({
    key_id: process.env.RZ_PAY_ID,
    key_secret: process.env.RZ_PAY_KEY
});

// Helper functions for map clustering
function performClustering(markers, zoom, bounds) {
    const GRID_SIZE = getGridSize(zoom);
    const clusterMap = new Map();
    const outliers = [];
    const MIN_CLUSTER_SIZE = 3;

    markers.forEach(marker => {
        const lat = parseFloat(marker.lat);
        const lng = parseFloat(marker.lng);

        const gridX = Math.floor(lng / GRID_SIZE);
        const gridY = Math.floor(lat / GRID_SIZE);
        const gridKey = `${gridX},${gridY}`;

        if (!clusterMap.has(gridKey)) {
            clusterMap.set(gridKey, []);
        }
        clusterMap.get(gridKey).push(marker);
    });

    const clusters = [];
    let clusterIdCounter = 1;

    clusterMap.forEach((markersInCell) => {
        if (markersInCell.length >= MIN_CLUSTER_SIZE) {
            const avgLat = markersInCell.reduce((sum, m) => sum + parseFloat(m.lat), 0) / markersInCell.length;
            const avgLng = markersInCell.reduce((sum, m) => sum + parseFloat(m.lng), 0) / markersInCell.length;
            const avgRating = markersInCell.reduce((sum, m) => sum + parseFloat(m.rating), 0) / markersInCell.length;
            const hasPremium = markersInCell.some(m => m.isPremium);

            const lats = markersInCell.map(m => parseFloat(m.lat));
            const lngs = markersInCell.map(m => parseFloat(m.lng));

            clusters.push({
                id: `cluster_${clusterIdCounter++}`,
                type: "cluster",
                lat: avgLat,
                lng: avgLng,
                count: markersInCell.length,
                avgRating: Math.round(avgRating * 10) / 10,
                hasPremium,
                bounds: {
                    northEast: { lat: Math.max(...lats), lng: Math.max(...lngs) },
                    southWest: { lat: Math.min(...lats), lng: Math.min(...lngs) }
                }
            });
        } else {
            markersInCell.forEach(m => {
                outliers.push({
                    id: m.id,
                    type: "marker",
                    name: m.name,
                    lat: parseFloat(m.lat),
                    lng: parseFloat(m.lng),
                    rating: parseFloat(m.rating),
                    isPremium: Boolean(m.isPremium),
                    isFavorite: Boolean(m.isFavorite)
                });
            });
        }
    });

    return { clusters, outliers };
}

function getGridSize(zoom) {
    const gridSizes = {
        1: 10.0, 2: 5.0, 3: 2.5, 4: 1.25, 5: 0.625,
        6: 0.3125, 7: 0.15625, 8: 0.078125, 9: 0.0390625,
        10: 0.01953125, 11: 0.009765625, 12: 0.0048828125, 13: 0.00244140625
    };
    return gridSizes[zoom] || 0.001;
}

export class userappmiddleware { }

userappmiddleware.user = {
    getprofile: async (user) => {
        try {
            const res = await userDbController.app.getprofile(user.id);

            return res
        } catch (error) {
            throw Error.SomethingWentWrong()
        }
    },
    getallstores: async ({ body, user }) => {
        try {
            if (user !== null && user !== undefined) {
                const { latitude, longitude } = body;
                if (!latitude || !longitude) {
                    throw Error.SomethingWentWrong("Latitude and Longitude are required");
                }

                // const max_radius = await userDbController.app.getmaxradius(body);

                const max_radius_m = 500000;

                const dLat = max_radius_m / 111045;
                const dLng = max_radius_m / (111045 * Math.cos(latitude * Math.PI / 180));
                const minLat = latitude - dLat, maxLat = latitude + dLat;
                const minLng = longitude - dLng, maxLng = longitude + dLng;

                const nearbyStores = await userDbController.app.getnearbystores(latitude, longitude, minLat, maxLat, minLng, maxLng);


                const fetchallstores = user ? await userDbController.app.getallfavourites(user.id) : [];




                const new_array = Array.isArray(fetchallstores) ? fetchallstores.map((item) => item.store_id) : [];

                const storePromises = nearbyStores.map(store => {
                    // Parse images if it's a string
                    if (typeof store.images === "string") {
                        try {
                            store.images = JSON.parse(store.images);
                        } catch (parseError) {
                        }
                    }


                    // Return a promise for each store
                    return userDbController.app.getstorereviews(store)
                        .then(reviews => {
                            // Calculate average rating 
                            store.is_favourite = new_array.includes(store.store_id) ? true : false;
                            const totalRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
                            const averageRating = reviews.length ? totalRatings / reviews.length : 0;
                            store.averagerating = averageRating;
                            return store;
                        })
                        .catch(error => {
                            store.averagerating = 0;
                            return store;
                        });
                });

                // Wait for all store promises to resolve
                const stores = await Promise.all(storePromises);

                return stores;
            } else {
                const { latitude, longitude } = body;
                if (!latitude || !longitude) {
                    throw Error.SomethingWentWrong("Latitude and Longitude are required");
                }

                const max_radius = await userDbController.app.getmaxradius(body);

                const max_radius_m = max_radius

                const dLat = max_radius_m / 111045;
                const dLng = max_radius_m / (111045 * Math.cos(latitude * Math.PI / 180));
                const minLat = latitude - dLat, maxLat = latitude + dLat;
                const minLng = longitude - dLng, maxLng = longitude + dLng;

                const nearbyStores = await userDbController.app.getnearbystores(latitude, longitude, minLat, maxLat, minLng, maxLng);

                const storePromises = nearbyStores.map(store => {
                    if (typeof store.images === "string") {
                        try {
                            store.images = JSON.parse(store.images);
                        } catch (parseError) {
                        }
                    }

                    return userDbController.app.getstorereviews(store)
                        .then(reviews => {
                            store.is_favourite = false;
                            const totalRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
                            const averageRating = reviews.length ? totalRatings / reviews.length : 0;
                            store.averagerating = averageRating;
                            return store;
                        })
                        .catch(error => {
                            store.averagerating = 0;
                            return store;
                        });
                });


                const stores = await Promise.all(storePromises);

                return stores;
            }

        } catch (error) {
            throw Error.SomethingWentWrong("could not get nearby stores")
        }
    },
    addfavourites: async ({ store_id }, user) => {
        try {

            if (!store_id) {
                throw Error.SomethingWentWrong("not enough data")
            }

            const getfavourites = await userDbController.app.getfavourites(store_id, user.id);

            const ids = Array.isArray(getfavourites) ? getfavourites.map((item) => item.store_id) : [];

            if (ids.includes(store_id)) {
                const deletefavourites = await userDbController.app.deletefavourites_1(store_id, user.id);

                if (!deletefavourites) {
                    throw Error.SomethingWentWrong("could not delete favourites")
                }

                return "Store Removed From Favourites Successfully";
            }

            const res = await userDbController.app.addfavourites(store_id, user.id);


            return "favourites added sucssesfully"


        } catch (error) {
            throw Error.SomethingWentWrong()
        }
    },
    getfavourites: async ({ id }) => {
        try {
            const getfavourites = await userDbController.app.getfavourites_1(id);


            const ids = Array.isArray(getfavourites) ? getfavourites.map((item) => item.store_id) : [];

            let data = []

            for (const id of ids) {
                const res = await userDbController.app.getstores(id);

                // Check if res is an array and has at least one item
                if (Array.isArray(res) && res.length > 0 && res[0]) {
                    // Parse images if it's a string
                    if (res[0].images && typeof res[0].images === "string") {
                        try {
                            res[0].images = JSON.parse(res[0].images);
                        } catch (error) {
                        }
                    }

                    data.push(res[0]);
                } else if (res && !Array.isArray(res)) {
                    // If res is not an array but exists (maybe a single object)
                    if (res.images && typeof res.images === "string") {
                        try {
                            res.images = JSON.parse(res.images);
                        } catch (error) {
                        }
                    }

                    data.push(res);
                }
            }


            for (const item of data) {
                const reviews = await userDbController.app.getstorereviews(item);
                const totalRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
                const averageRating = reviews.length ? totalRatings / reviews.length : 0;
                item.averagerating = averageRating;
            }


            return data

        } catch (error) {
            throw Error.SomethingWentWrong()
        }
    },
    deletefavourites: async ({ body, user }) => {
        try {
            const res = await userDbController.app.deletefavourites(body, user.id);


            return "favourites deleted sucssessfully "

        } catch (error) {
            throw Error.SomethingWentWrong()
        }
    },
    addreview: async ({ body, user }) => {
        //////console.log("🚀 ~ addreview: ~ body:", body)
        try {
            const getreview = await userDbController.app.getreview(body, user.id);

            if (getreview && getreview !== null && getreview !== undefined) {
                throw Error.SomethingWentWrong("You have already added a review for this store")
            }

            const res = await userDbController.app.addreview(body, user.id);

            return "Review Added Successfully"
        } catch (error) {
            //////console.log("🚀 ~ addreview: ~ error:", error)
            throw Error.SomethingWentWrong()
        }
    },
    getallreview: async ({ body, user }) => {
        try {
            const res = await userDbController.app.getallreview(body, user.id);

            res.forEach((item) => {
                item.store_images = JSON.parse(item.store_images);
            })

            return res
        } catch (error) {
            throw Error.SomethingWentWrong()
        }
    },

    updaterating: async ({ body, user }) => {
        //////console.log("🚀 ~ updaterating: ~ body:", body)
        try {
            const res = await userDbController.app.updaterating(body, user.id);

            return "Rating Updated Successfully"
        } catch (error) {
            throw Error.SomethingWentWrong()
        }
    },

    deletereview: async ({ body, user }) => {
        try {
            const res = await userDbController.app.deletereview(body, user.id);

            return "Review Deleted Successfully"
        } catch (error) {
            throw Error.SomethingWentWrong()
        }
    },
    getinvitecode: async ({ body, user }) => {
        try {
            const res = await userDbController.app.getinvitecode(body, user.id);

            if (!res) {
                throw Error.SomethingWentWrong("No Invite Code Found")
            }

            return res
        } catch (error) {
            throw Error.SomethingWentWrong()
        }
    },

    verifyinvitecode: async ({ body, user }) => {
        try {
            const founduser = await userDbController.app.verifyinvitecode(body, user.id);

            if (!founduser || founduser === undefined || founduser === null || founduser.id == null) {
                throw Error.SomethingWentWrong("Invalid Invite Code")
            } else {

                if (founduser.id == user.id) {
                    throw Error.SomethingWentWrong("You cannot use your own invite code")
                }
                const add_amount = 10;

                const update_wallet = await userDbController.app.addwallet_1(add_amount, founduser.id);
                if (!update_wallet) {
                    throw Error.SomethingWentWrong("could not update wallet")
                }


                const description = `${founduser.firstname} Joined`;


                const type = 'credit'

                const updatelogs = await userDbController.app.addlogs(add_amount, founduser.id, type, description);
                if (!updatelogs) {
                    throw Error.SomethingWentWrong("could not update logs")
                }
                return "Invite Code Verified Successfully, Wallet Updated"
            }

        } catch (error) {
            throw Error.SomethingWentWrong("Invalid Invite Code")
        }
    },
    initiaterefund: async ({ body, user }) => {
        try {
            const get_ordrer = await userDbController.app.getorder(body, user.id);

            if (get_ordrer.status === "cancelled") {
                throw Error.SomethingWentWrong("Order already cancelled")
            }

            if (!get_ordrer || get_ordrer === null) {
                throw Error.SomethingWentWrong("No Order Found")
            }
            if (new Date(get_ordrer.booking_date) - new Date() > 10 * 60 * 60 * 1000) {


                const cancel_ortder = await userDbController.app.cancelorder(body, user.id);
                if (!cancel_ortder) {
                    throw Error.SomethingWentWrong("could not cancel order")
                }

                return "Order cancelled successfully";

            } else {

                const cancel_ortder = await userDbController.app.cancelorder(body, user.id);
                if (!cancel_ortder) {
                    throw Error.SomethingWentWrong("could not cancel order")
                }

                const refund = await userDbController.app.initiaterefund(get_ordrer, body, user.id);
                if (!refund) {
                    throw Error.SomethingWentWrong();
                }

                return "Your order has been cancelled and a refund will be processed within 3 to 5 business days.";
            }

        } catch (error) {
            //console.log("🚀 ~ initiaterefund: ~ error:", error)
            throw Error.SomethingWentWrong("could not initiate refund")
        }
    },
    updatebooking: async ({ body, user }) => {
        try {

            const getbooking = await userDbController.app.getbooking(body, user.id);

            if (!getbooking || getbooking === null || getbooking === undefined) {
                throw Error.SomethingWentWrong("No Booking Found")
            }

            // if(new Date(getbooking.booking_date) - new Date() < 8 * 60 * 60 * 1000){
            //     throw Error.SomethingWentWrong("You cannot update booking within 8 hours of the appointment")
            // }

            const response = await userDbController.app.updatebookingdate(body, user.id);


            if (!response) {
                throw Error.SomethingWentWrong("could not update booking")
            }

            return "Booking Updated Successfully"
        } catch (error) {
            ////console.log("🚀 ~ updatebooking: ~ error:", error)
            throw Error.SomethingWentWrong("could not update booking")
        }
    },
    getransactions: async ({ body, user }) => {
        try {
            const transactions = await userDbController.app.gettransactions(body, user.id);

            if (!transactions || transactions.length == 0) {
                throw Error.SomethingWentWrong("No Transactions Found")
            }

            transactions.forEach((item) => {
                item.date = new Date(item.date).toLocaleString("en-US", {
                    timeZone: "Asia/Kolkata",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                });
            });

            return transactions
        } catch (error) {
            throw Error.SomethingWentWrong("could not get transactions")
        }
    },
    getnotification: async ({ body, user }) => {
        console.log("🚀 ~ user:", user)
        try {
            if (user !== null) {
                const getnotification = await userDbController.app.getnotification(user.id);
                //console.log("🚀 ~ getnotification: ~ getnotification:", getnotification)


                if (getnotification === undefined || getnotification.lenght > 0, getnotification === null) {
                    return []
                }

                getnotification.forEach((item) => {
                    item.image = JSON.parse(item?.image)
                })

                return getnotification
            } else {
                return []
            }
        } catch (error) {
            //console.log("🚀 ~ getnotification: ~ error:", error)
            throw Error.SomethingWentWrong("could not get notification")
        }
    },

    getReviewsV2: async ({ query, user }) => {
        try {
            const page = parseInt(query.page) || 1;
            const limit = parseInt(query.limit) || 10;
            const offset = (page - 1) * limit;

            const { reviews, total } = await userDbController.app.getReviewsV2({
                userId: user.id,
                offset,
                limit
            });

            return formatReviewListV2({ reviews, total, page, limit });
        } catch (error) {
            console.error("Error in getReviewsV2 middleware:", error);
            throw Error.SomethingWentWrong("Failed to fetch reviews");
        }
    },

    updateReviewV2: async ({ body, query, user }) => {
        try {
            const reviewId = query.id;
            if (!reviewId) {
                throw Error.BadRequest("Review ID is required in query parameters");
            }

            const { rating, description } = body;
            if (!rating) {
                throw Error.BadRequest("Rating is required");
            }

            const affectedRows = await userDbController.app.updateReviewV2({
                reviewId,
                userId: user.id,
                rating,
                description
            });

            if (affectedRows === 0) {
                throw Error.NotFound("Review not found or unauthorized");
            }

            return "Review updated successfully";
        } catch (error) {
            if (error.status) throw error;
            console.error("Error in updateReviewV2 middleware:", error);
            throw Error.SomethingWentWrong("Failed to update review");
        }
    },

    deleteReviewV2: async ({ query, user }) => {
        try {
            const reviewId = query.id;
            if (!reviewId) {
                throw Error.BadRequest("Review ID is required in query parameters");
            }

            const affectedRows = await userDbController.app.deleteReviewV2({
                reviewId,
                userId: user.id
            });

            if (affectedRows === 0) {
                throw Error.NotFound("Review not found or unauthorized");
            }

            return "Review deleted successfully";
        } catch (error) {
            if (error.status) throw error;
            console.error("Error in deleteReviewV2 middleware:", error);
            throw Error.SomethingWentWrong("Failed to delete review");
        }
    },

    getbanner: async ({ body }) => {
        try {
            const getbanner = await userDbController.app.getbanner();

            if (!getbanner) {
                return []
            }

            return getbanner
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("cannot Get Banner")
        }
    },
    getstorebyid: async ({ body, user }) => {
        try {
            const storedetails = await userDbController.app.getstorebyid(body);

            // Parse images and set favorite status for store details
            if (storedetails && storedetails.length > 0) {
                // Get user's favorites if user is logged in
                let new_array = [];
                if (user && user.id) {
                    const fetchallstores = await userDbController.app.getallfavourites(user.id);
                    new_array = Array.isArray(fetchallstores) ? fetchallstores.map((item) => item.store_id) : [];
                }

                storedetails.forEach((item) => {
                    // Parse images if it's a string
                    if (typeof item.images === "string") {
                        try {
                            item.images = JSON.parse(item.images);
                        } catch (parseError) {
                            // Keep original if parsing fails
                        }
                    }

                    // Set favorite status
                    item.is_favourite = new_array.includes(body.id) ? true : false;
                });
            }

            const get_serviece_category = await userDbController.app.getservicecategory(body.id);
            const aminities = await userDbController.app.getaminities(body);
            const getservices = await userDbController.app.getservices(body);
            const getallproffesionals = await userDbController.app.getallprofessionals(body);
            const getcombos = await userDbController.app.getcombos(body);
            const getratings = await userDbController.app.getallstoreratings(body);


            var total_stars = 0;
            var total_length = 0
            if (getratings != null && getratings.length > 0) {
                getratings.forEach((item) => {
                    total_stars += parseInt(item.rating);

                });
                total_length = getratings.length
            }

            const average_ratings = total_length > 0 ? total_stars / total_length : 0;

            const getpartneraddress = await userDbController.app.getpartneraddress(body);

            let data = [];

            // Get nearby stores if location is available
            if (getpartneraddress && getpartneraddress.location && getpartneraddress.location.coordinates) {
                try {
                    const [long, lat] = getpartneraddress.location.coordinates;
                    const res = await userDbController.app.getstoresnearstorses(long, lat, body.id);

                    // Get user's favorites if user is logged in
                    let new_array = [];
                    if (user && user.id) {
                        const fetchallstores = await userDbController.app.getallfavourites(user.id);
                        new_array = Array.isArray(fetchallstores) ? fetchallstores.map((item) => item.store_id) : [];
                    }

                    for (const item of res) {
                        // Parse images if it's a JSON string
                        if (typeof item.images === "string") {
                            try {
                                item.images = JSON.parse(item.images);
                            } catch (parseError) {
                                // Keep original if parsing fails
                            }
                        }

                        // Set favorite status
                        item.is_favourite = new_array.includes(item.store_id) ? true : false;

                        // Get and calculate average rating
                        try {
                            const reviews = await userDbController.app.getstorereviews(item);
                            const totalRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
                            const averageRating = reviews.length ? totalRatings / reviews.length : 0;
                            item.averagerating = averageRating;
                        } catch (reviewError) {
                            item.averagerating = 0;
                        }

                        data.push(item);
                    }
                } catch (nearbyError) {
                    console.log("Error fetching nearby stores:", nearbyError);
                    // Continue without nearby stores
                }
            }

            const responsedata = {
                basicinfo: storedetails,
                services: getservices,
                aminities: aminities,
                stylist: getallproffesionals,
                average: average_ratings,
                address: getpartneraddress,
                service_category: get_serviece_category,
                ratings: getratings,
                combos: getcombos,
                nearbystores: data,
            }
            return responsedata;
        } catch (error) {
            console.log("Error in getstorebyid:", error.message);
            throw Error.SomethingWentWrong("Failed to get store by id")
        }
    },
    getslotsbydate: async ({ body, user }) => {
        try {
            if (user !== null && user !== undefined) {
                let quantity = 1;

                const getactive = await userDbController.app.getactivechairsubs(body);

                if (getactive && getactive !== null && getactive !== undefined) {
                    quantity = parseInt(getactive.quantity);
                }

                const free_slots = await userDbController.app.getfreeslots(body, quantity);


                const booked_slots = await userDbController.app.getbookedslots(body, quantity);



                const taggedFree = free_slots.map(slot => ({ ...slot, status: 'free' }));

                if (new Date(body.date).toDateString() === new Date().toDateString()) {
                    ////console.log("🚀 ~ getslotsbydate: ~ new Date().toDateString():", new Date().toDateString())
                    const currentTime = new Date();
                    const currentHour = currentTime.getHours();
                    const currentMinute = currentTime.getMinutes();

                    // taggedFree slots update
                    taggedFree.forEach(slot => {
                        // Create a Date object for the slot time
                        const slotTime = new Date(`1970-01-01T${slot.from}`);
                        ////console.log("🚀 ~ getslotsbydate: ~ slotTime:", slotTime)
                        // Compare slot time with current time
                        if (slotTime.getHours() < currentHour || (slotTime.getHours() === currentHour && slotTime.getMinutes() <= currentMinute)) {
                            slot.status = 'free';
                        }
                    });
                }


                const taggedBooked = booked_slots.map(slot => ({ ...slot, status: 'booked' }));




                const allSlots = [...taggedFree, ...taggedBooked];

                allSlots.sort((a, b) => a.from.localeCompare(b.from));


                return allSlots
            } else {
                let quantity = 1;

                const getactive = await userDbController.app.getactivechairsubs(body);

                if (getactive && getactive !== null && getactive !== undefined) {
                    quantity = parseInt(getactive.quantity);
                }

                const free_slots = await userDbController.app.getfreeslots(body, quantity);


                const booked_slots = await userDbController.app.getbookedslots(body, quantity);



                const taggedFree = free_slots.map(slot => ({ ...slot, status: 'free' }));

                if (new Date(body.date).toDateString() === new Date().toDateString()) {
                    ////console.log("🚀 ~ getslotsbydate: ~ new Date().toDateString():", new Date().toDateString())
                    const currentTime = new Date();
                    const currentHour = currentTime.getHours();
                    const currentMinute = currentTime.getMinutes();

                    taggedFree.forEach(slot => {
                        const slotTime = new Date(`1970-01-01T${slot.from}`);
                        ////console.log("🚀 ~ getslotsbydate: ~ slotTime:", slotTime)
                        if (slotTime.getHours() < currentHour || (slotTime.getHours() === currentHour && slotTime.getMinutes() <= currentMinute)) {
                            slot.status = 'free';
                        }
                    });
                }


                const taggedBooked = booked_slots.map(slot => ({ ...slot, status: 'booked' }));




                const allSlots = [...taggedFree, ...taggedBooked];

                allSlots.sort((a, b) => a.from.localeCompare(b.from));


                return allSlots
            }

        } catch (error) {
            console.log("🚀 ~ getslotsbydate: ~ error:", error)
            throw Error.SomethingWentWrong();
        }
    },
    getSlotStatusV2: async (store_id, date) => {
        try {
            let quantity = 1;
            const getactive = await userDbController.app.getactivechairsubs({ store_id });
            if (getactive && getactive.quantity) {
                quantity = parseInt(getactive.quantity);
            }

            const rawSlots = await userDbController.app.getSlotStatusData(store_id, date);

            const slots = rawSlots.map(slot => {
                let status = 'available';

                if (slot.is_blocked === 1) {
                    status = 'blocked';
                } else if (parseInt(slot.appointment_count) >= quantity) {
                    status = 'booked';
                }

                return {
                    id : slot.id,
                    time: slot.from,
                    status: status
                };
            });

            return slots;
        } catch (error) {
            console.error("Error in getSlotStatusV2 middleware:", error);
            throw Error.SomethingWentWrong();
        }
    },
    addtocart: async ({ body, user }) => {
        try {
            const addtocart = await userDbController.app.getcart();


        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong();
        }
    },
    createorder: async ({ body, user }) => {
        console.log("🚀 ~ body:", body)
        ////console.log("🚀 ~ createorder: ~ body:", body)
        let transaction;
        try {
            let total = 0
            //Service Data Amount Calculation
            for (const item of body?.service) {
                const get_total_amount = await userDbController.app.gettotal(item.id)
                console.log("🚀 ~ get_total_amount:", get_total_amount)
                if (!get_total_amount || get_total_amount === null || get_total_amount === undefined) {
                    throw Error.SomethingWentWrong("could not get total amount")
                }
                const new_amount = (get_total_amount.discounted_amount !== null && get_total_amount.discounted_amount > 0)
                    ? get_total_amount.discounted_amount
                    : get_total_amount.amount;
                console.log("🚀 ~ new_amount:", new_amount)
                total += new_amount;

            }
            // Combo Data Amount Calculation
            if (body?.combos && Array.isArray(body.combos)) {
                for (const item of body.combos) {
                    const get_total_amount = await userDbController.app.gettotal_combo(item.id)
                    total += get_total_amount.amount;
                }
            }


            // Discount Calculation
            if (body?.is_discounted === true) {
                const get_discount = await userDbController.app.getdiscount(body.coupon_id);
                if (!get_discount || get_discount === null || get_discount === undefined) {
                    throw Error.SomethingWentWrong("could not get discount")
                }
                const getdiscount = await userDbController.app.getusagecount(body, user.id);

                if (parseInt(get_discount.usage_limit) && parseInt(get_discount.usage_limit) > 0 && getdiscount >= parseInt(get_discount.usage_limit)) {
                    throw Error.SomethingWentWrong("You have exceeded the usage limit for this discount")
                }
                const addusage = await userDbController.app.addusage(body, user.id);
                if (get_discount.discount_type === "percentage") {
                    const discount_amount = (total * get_discount.discount_value) / 100;
                    total = total - discount_amount;
                } else if (get_discount.discount_type === "flat") {
                    total = total - get_discount.discount_value;
                } else {
                    throw Error.SomethingWentWrong("Invalid Discount Type")
                }
            }
            // Final Amount Calculation with GST
            const final_total = total + (total * 0.05);
            console.log("🚀 ~ final_total:", final_total)
            // Wallet Amount Calculation and Order Creation
            if (body.is_wallet) {
                const get_wallet = await userDbController.app.getwalletamount(body, user.id);
                if (!get_wallet.wallet || get_wallet.wallet === null || get_wallet.wallet === undefined) {
                    throw Error.SomethingWentWrong("could not get wallet amount")
                }
                if (get_wallet.wallet >= final_total) {
                    // Full Payment via Wallet
                    const remaining_wallet = get_wallet.wallet - final_total;

                    let is_combo = false
                    // Check if the order includes combo items
                    if (body.is_combo && (body.combos != null || (body.combos != undefined && body.combos.length > 0))) {
                        is_combo = true
                    }
                    // Start a database transaction
                    transaction = await connection.transaction();
                    // Create the order in the database
                    const appointment = await userDbController.app.createorder(body, user.id, transaction, null, is_combo, total, final_total);
                    console.log("🚀 ~ appointment:", appointment)
                    // Initialize an array to hold mail data
                    const maildata = []
                    // Retrieve user data
                    const userdata = await userDbController.app.getuser(body, user);
                    // Add service items to the order
                    if (body.service != null && body.service != undefined && body.service.length > 0) {
                        for (const item of body.service) {
                            // Get the total amount for each service item
                            const get_total_amount = await userDbController.app.gettotal(item.id);
                            const amount = (get_total_amount.discounted_amount !== null && get_total_amount.discounted_amount > 0)
                                ? get_total_amount.discounted_amount
                                : get_total_amount.amount;
                            // Add service items order in database
                            await userDbController.app.addserviceitems(body, user.id, item.id, amount, appointment.id, transaction);

                            // const getservicebyid = await userDbController.app.getservicebyid(item.id);
                            // maildata.push(getservicebyid);
                        }
                    }
                    // Add combo items to the order
                    if (body.is_combo && (body.combos != null || (body.combos != undefined && body.combos.length > 0))) {
                        for (const item of body.combos) {
                            // Add combo items order in database
                            const additems = await userDbController.app.addcomboitems(body, user.id, item.id, item.amount, appointment.id, transaction);
                            // Retrieve combo item details for mail data
                            const getcomboitems = await userDbController.app.getcombobyid(item.id);
                            maildata.push(getcomboitems);

                        }
                    }

                    // Update the user's wallet with the remaining amount
                    const updatewallet = await userDbController.app.updatewallet(remaining_wallet, user.id);


                    const description = "appointment booked"
                    // Add logs for the transaction
                    const addlogs = await userDbController.app.addlogs(total, user.id, "debit", description);
                    // Commit the transaction to the database

                    await transaction.commit();
                    // Return success message with no order ID since payment is completely via wallet
                    return { message: "Payment Successfull", order_id: null }
                } else {
                    // Partial Payment via Wallet
                    const new_total = total - get_wallet.wallet
                    // Calculate remaining wallet balance
                    const remaining_wallet = 0
                    // Create Razorpay order for the remaining amount                       
                    const amount = parseInt(new_total + (new_total * 0.05)) * 100;
                    const currency = 'INR';
                    // Create Razorpay order for the remaining amount
                    const res = await razorpay.orders.create({ amount, currency })
                    // Store the Razorpay order ID
                    const razorpay_id = res.id



                    let is_combo = false
                    // Check if the order includes combo items
                    if (body.is_combo && (body.combos != null || (body.combos != undefined && body.combos.length > 0))) {
                        is_combo = true
                    }
                    // Start a database transaction
                    transaction = await connection.transaction();
                    // Create the order in the database
                    const appointment = await userDbController.app.createorder(body, user.id, transaction, null, is_combo, total, final_total);
                    // Initialize an array to hold mail data
                    if (body.service != null && body.service != undefined && body.service.length > 0) {
                        for (const item of body.service) {
                            // Get the total amount for each service item
                            const get_total_amount = await userDbController.app.gettotal(item.id);
                            // Determine the amount to be charged for the service item
                            const amount = (get_total_amount.discounted_amount !== null && get_total_amount.discounted_amount > 0)
                                ? get_total_amount.discounted_amount
                                : get_total_amount.amount;
                            // Add service items order in database
                            await userDbController.app.addserviceitems(body, user.id, item.id, amount, appointment.id, transaction);

                            // const getservicebyid = await userDbController.app.getservicebyid(item.id);
                            // maildata.push(getservicebyid);
                        }
                    }
                    // Add combo items to the order
                    if (body.is_combo && (body.combos != null || (body.combos != undefined && body.combos.length > 0))) {
                        for (const item of body.combos) {
                            // Add combo items order in database
                            const additems = await userDbController.app.addcomboitems(body, user.id, item.id, item.amount, appointment.id, transaction);
                        }
                    }
                    // Update the user's wallet with the remaining amount
                    const updatewallet = await userDbController.app.updatewallet(remaining_wallet, user.id);

                    await transaction.commit();

                    return { order_id: res.id, message: null }


                }
            } else {
                const amount = parseInt(final_total) * 100;
                const currency = 'INR';
                const res = await razorpay.orders.create({ amount, currency })
                const razorpay_id = res.id


                let is_combo = false

                if (body.is_combo && (body.combos != null || (body.combos != undefined && body.combos.length > 0))) {
                    is_combo = true
                }

                transaction = await connection.transaction();

                const appointment = await userDbController.app.createorder(body, user.id, transaction, razorpay_id, is_combo, total, final_total);

                if (body.service != null && body.service != undefined && body.service.length > 0) {
                    for (const item of body.service) {
                        const get_total_amount = await userDbController.app.gettotal(item.id);
                        const amount = (get_total_amount.discounted_amount !== null && get_total_amount.discounted_amount > 0)
                            ? get_total_amount.discounted_amount
                            : get_total_amount.amount;

                        await userDbController.app.addserviceitems(body, user.id, item.id, amount, appointment.id, transaction);

                        // const getservicebyid = await userDbController.app.getservicebyid(item.id);
                        // maildata.push(getservicebyid);
                    }
                }

                if (body.is_combo && (body.combos != null || (body.combos != undefined && body.combos.length > 0))) {
                    for (const item of body.combos) {
                        const additems = await userDbController.app.addcomboitems(body, user.id, item.id, item.amount, appointment.id, transaction);
                    }
                }

                await transaction.commit();

                return { order_id: res.id, message: null }

            }

        } catch (error) {
            console.log("🚀 ~ error:", error)
            if (transaction) {
                await transaction.rollback();
            }

            throw Error.SomethingWentWrong("could not add shippping address")
        }
    },

    createOrderV2: async ({ body, user }) => {
        let transaction;
        try {
            const {
                booking_date, slot_id, services, combos, is_combo,
                booking_for, guest_id, guest_name, guest_phone, guest_gender,
                professional_id, amount, is_wallet, is_discounted, discount_id,
                coupon_code, wallet_amount_used, gst, platform_fee, store_id,
                discounted_amount
            } = body;

            // 1. Validation & Pre-calculations
            const serviceIds = (services || []).map(s => s.service_id);
            const comboIds = (combos || []).map(c => c.combo_id);

            if (serviceIds.length === 0 && comboIds.length === 0) {
                throw Error.SomethingWentWrong("At least one service or combo is required");
            }

            // Fetch all details in parallel (Bulk query to prevent N+1)
            const [dbServices, dbCombos] = await Promise.all([
                serviceIds.length > 0 ? userDbController.app.getStoreServicesByIdsV2(serviceIds) : [],
                comboIds.length > 0 ? userDbController.app.getCombosByIdsV2(comboIds) : []
            ]);

            // Validate that all requested services/combos were found and belong to the store
            if (serviceIds.length > 0 && dbServices.length !== serviceIds.length) {
                throw Error.SomethingWentWrong("One or more services are invalid or inactive");
            }
            if (comboIds.length > 0 && dbCombos.length !== comboIds.length) {
                throw Error.SomethingWentWrong("One or more combos are invalid or inactive");
            }

            let calculatedSubTotal = 0;
            dbServices.forEach(s => {
                const discountedAmount = parseFloat(s.discounted_amount) || 0;
                const baseAmount = parseFloat(s.amount) || 0;
                calculatedSubTotal += (discountedAmount > 0 ? discountedAmount : baseAmount);
            });
            dbCombos.forEach(c => {
                calculatedSubTotal += parseFloat(c.amount) || 0;
            });

            if (calculatedSubTotal === 0) {
                throw Error.SomethingWentWrong("Order subtotal cannot be zero");
            }

            let finalTotal = calculatedSubTotal;

            // Handle Discount
            if (is_discounted && discount_id) {
                const discount = await userDbController.app.getdiscount(discount_id);
                if (discount) {
                    const usageCount = await userDbController.app.getCouponUsageCountv2(discount_id, user.id);
                    if (discount.usage_limit > 0 && usageCount >= discount.usage_limit) {
                        throw Error.SomethingWentWrong("Coupon usage limit exceeded");
                    }
                    if (discount.discount_type === "percentage") {
                        finalTotal -= (calculatedSubTotal * discount.discount_value) / 100;
                    } else if (discount.discount_type === "flat") {
                        finalTotal -= discount.discount_value;
                    }
                }
            }

            // Add GST and Fees
            const totalWithTaxes = finalTotal + (parseFloat(gst) || 0) + (parseFloat(platform_fee) || 0);

            let razorpayOrderId = null;
            let paymentStatus = "pending";
            let walletDeduction = 0;

            // Create Razorpay Order
            const rzpOrder = await razorpay.orders.create({
                amount: Math.round(totalWithTaxes * 100),
                currency: 'INR'
            });
            razorpayOrderId = rzpOrder.id;

            transaction = await connection.transaction();

            // 2. Handle Guest Booking
            let actualGuestId = guest_id;
            if (booking_for !== "myself" && !guest_id && guest_name) {
                const newGuest = await userDbController.app.addGuestDetails({
                    name: guest_name,
                    phone: guest_phone,
                    gender: guest_gender,
                    age: null
                }, user.id);
                actualGuestId = newGuest.id;
            }

            // 3. Create Appointment
            const appointmentData = {
                store_id: store_id || (dbServices[0]?.store_id || dbCombos[0]?.store_id),
                user_id: user.id,
                booking_date: booking_date,
                amount: totalWithTaxes,
                slot_id: slot_id, // Assuming it maps to BIGINT or handled by DB
                is_combo: is_combo,
                profesional_id: professional_id,
                razorpay_id: razorpayOrderId,
                payment_status: paymentStatus,
                is_wallet: is_wallet,
                is_discounted: is_discounted,
                discounted_amount: finalTotal,
                discount_id: discount_id,
                gst: 5,
                status: "booked",
                booking_for: booking_for || "myself",
                guest_id: actualGuestId,
                created_at: new Date(),
                updated_at: new Date()
            };

            const appointment = await userDbController.app.createOrderV2(appointmentData, transaction);

            // 4. Add Items
            const items = [];
            dbServices.forEach(s => {
                items.push({
                    appointment_id: appointment.id,
                    service_id: s.id,
                    service_amount: (s.discounted_amount > 0 ? s.discounted_amount : s.amount)
                });
            });
            dbCombos.forEach(c => {
                items.push({
                    appointment_id: appointment.id,
                    combo_id: c.id,
                    service_amount: c.amount
                });
            });

            if (items.length > 0) {
                await userDbController.app.addAppointmentItemsV2(items, transaction);
            }


            await transaction.commit();

            return {
                order_id: appointment.id,
                razorpay_order_id: razorpayOrderId,
                amount: totalWithTaxes,
                currency: "INR",
                booking_date: booking_date,
                status: appointmentData.status
            };

        } catch (error) {
            console.error("createOrderV2 ERROR:", error);
            if (transaction) await transaction.rollback();
            throw error;
        }
    },

    paymentsuccessV2: async ({ body, user }) => {
        let transaction;
        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

            const appointment = await userDbController.app.getbooking_2(razorpay_order_id, user.id);
            if (!appointment) throw Error.SomethingWentWrong("Appointment not found");

            if (
                appointment.payment_status === "success" ||
                appointment.payment_status === "sucssess"
            ) {
                return {
                    success: true,
                    message: "Payment successfully verified and order confirmed",
                };
            }

            transaction = await connection.transaction();

            const rowsUpdated = await userDbController.app.updatebooking(
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature
            );

            if (rowsUpdated) {
                if (appointment.is_discounted && appointment.discount_id) {
                    const couponUsage = await userDbController.app.getCouponUsageCount1(
                        { coupon_id: appointment.discount_id },
                        user.id
                    );
                    if (!couponUsage) {
                        await userDbController.app.addUsedCoupons(
                            appointment.discount_id,
                            user.id
                        );
                    }
                }

                broadcastNewBooking({
                    id: appointment.id,
                    payable_amount: appointment.amount,
                    status: "booked",
                });

                await sendBookingConfirmedNotifications(appointment);
                await sendBookingConfirmedWhatsApp(appointment.id);
            }

            await transaction.commit();

            return {
                success: true,
                message: "Payment successfully verified and order confirmed"
            };
        } catch (error) {
            console.error("paymentsuccessV2 ERROR:", error);
            if (transaction) await transaction.rollback();
            throw error;
        }
    },

    cancelPendingOrderV2: async ({ body, user }) => {
        try {
            const { order_id } = body;

            if (!order_id) {
                throw Error.SomethingWentWrong("Order id is required");
            }

            const released = await userDbController.app.releasePendingAppointment({
                appointmentId: order_id,
                userId: user.id,
            });

            if (!released) {
                throw Error.SomethingWentWrong("No pending booking found to release");
            }

            return {
                success: true,
                message: "Booking cancelled and slot released",
            };
        } catch (error) {
            console.error("cancelPendingOrderV2 ERROR:", error);
            throw error;
        }
    },

    // --- Wallet & Razorpay V2 ---

    createRazorpayOrderV2: async ({ body }) => {
        try {
            const { amount, currency = "INR", receipt, notes } = body;

            if (!amount || amount <= 0) {
                throw Error.SomethingWentWrong("Invalid amount");
            }

            const options = {
                amount: Math.round(amount * 100), // convert to paise
                currency,
                receipt: receipt || `receipt_${Date.now()}`,
                notes: notes || {}
            };

            const order = await razorpay.orders.create(options);
            return {
                order_id: order.id,
                amount: order.amount,
                currency: order.currency
            };
        } catch (error) {
            console.error("createRazorpayOrderV2 Error:", error);
            throw Error.SomethingWentWrong(error.description || "Failed to create Razorpay order");
        }
    },


    createInternalOrder: async ({ body, user }) => {
        let transaction;

        try {
            let total = 0;

            // Service calculation
            for (const item of body.service || []) {
                const data = await userDbController.app.gettotal(item.id);
                const amount = data.discounted_amount > 0 ? data.discounted_amount : data.amount;
                total += amount;
            }

            // Combo calculation
            for (const item of body.combos || []) {
                const combo = await userDbController.app.gettotal_combo(item.id);
                total += combo.amount;
            }

            // Discount
            if (body.is_discounted) {
                const discount = await userDbController.app.getdiscount(body.coupon_id);
                if (discount.discount_type === "percentage") {
                    total -= (total * discount.discount_value) / 100;
                } else {
                    total -= discount.discount_value;
                }
            }

            const gst = total * 0.05;
            const final_total = total + gst;

            transaction = await connection.transaction();

            const appointment = await userDbController.app.createorder(
                body,
                user.id,
                transaction,
                null,          // razorpay_order_id (later)
                body.is_combo,
                total,
                final_total
            );

            //Add Coupons
            if (body.coupon_id) {
                const coupon = await userDbController.app.validatecouponwithid(body.coupon_id);
                if (!coupon) {
                    await transaction.rollback();
                    return "The coupon is Invalid or has expired";
                }
                const usageCount = await userDbController.app.getCouponUsageCount1(body, user.id);
                if (coupon.usage_limit > 0 && usageCount >= coupon.usage_limit) {
                    await transaction.rollback();
                    return "You have exceeded the usage limit for this discount";
                }
                await userDbController.app.addUsedCoupons(body.coupon_id, user.id);
            }

            // Add services
            for (const item of body.service || []) {
                const data = await userDbController.app.gettotal(item.id);
                const amount = data.discounted_amount > 0 ? data.discounted_amount : data.amount;
                await userDbController.app.addserviceitems(
                    body, user.id, item.id, amount, appointment.id, transaction
                );
            }

            // Add combos
            for (const item of body.combos || []) {
                await userDbController.app.addcomboitems(
                    body, user.id, item.id, item.amount, appointment.id, transaction
                );
            }

            await transaction.commit();

            return {
                orderId: appointment.id,
                finalAmount: final_total
            };

        } catch (err) {
            if (transaction) await transaction.rollback();
            throw err;
        }
    },


    createRazorpayOrder: async ({ body }) => {
        if (isNaN(body.amount) || body.amount <= 0) {
            throw Error.SomethingWentWrong("Invalid amount for Razorpay order");
        }
        const razorpayAmount = Math.round(body.amount * 100); // paise

        const razorpayOrder = await razorpay.orders.create({
            amount: razorpayAmount,
            currency: 'INR',
        });

        console.log("🚀 ~ razorpayOrder:", razorpayOrder)



        // Save Razorpay order ID in DB
        //await userDbController.app.updateRazorpayOrderId(
        //   orderId,
        //    razorpayOrder.id
        //);

        return {
            razorpay_order_id: razorpayOrder.id,
            amount: razorpayAmount
        };
    },

    paymentsucssess: async ({ body, user }) => {
        console.log("🚀 ~ paymentsucssess: ~ body:", body)
        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

            const getbooking = await userDbController.app.getbooking_2(razorpay_order_id, user.id);
            if (!getbooking) {
                throw Error.SomethingWentWrong("Appointment not found");
            }

            if (
                getbooking.payment_status === "success" ||
                getbooking.payment_status === "sucssess"
            ) {
                return "payment sucssessfull";
            }

            const response = await userDbController.app.updatebooking(razorpay_order_id, razorpay_payment_id, razorpay_signature);
            console.log("🚀 ~ response:", response)

            if (!response) {
                return "payment sucssessfull";
            }

            const getdata = await userDbController.app.getordredetails(razorpay_order_id);
            console.log("🚀 ~ getdata:", getdata)

            await userDbController.app.addwalletamount(getdata.store_id, getdata.amount);

            await sendBookingConfirmedNotifications(getdata);
            await sendBookingConfirmedWhatsApp(getdata.id);

            return "payment sucssessfull"
        } catch (error) {
            ////console.log("🚀 ~ paymentsucssess: ~ error:", error)
            throw Error.SomethingWentWrong("Payment Failed");
        }
    },
    getallappoinments: async ({ body, user }) => {
        try {
            let data = []

            const appoinments = await userDbController.app.getallapoinments(body, user.id);
            console.log("🚀 ~ appoinments:", appoinments)

            appoinments.forEach((item) => {
                item.images = JSON.parse(item.images);
            })

            const upcomming = []
            const past = []

            for (const item of appoinments) {
                const bookingDate = new Date(item.booking_date);
                const today = new Date();

                const [hours, minutes, seconds] = item.slot_from.split(':').map(Number);
                const appointmentDateTime = new Date(bookingDate);
                appointmentDateTime.setHours(hours, minutes, seconds, 0);

                if (appointmentDateTime > today) {
                    item.status = "upcomming";
                } else {
                    item.status = "past";
                }
            }

            for (const item of appoinments) {

                const getservices = await userDbController.app.getservicebyappoinment(item.id);
                const new_data = {
                    common_data: item,
                    items: getservices
                }

                if (new_data.common_data.status === "upcomming") {
                    upcomming.push(new_data)
                } else {
                    past.push(new_data)
                }

            }

            return { upcoming: upcomming, past: past }

        } catch (error) {
            throw Error.SomethingWentWrong();
        }
    },
    getstorebycategory: async ({ body, user }) => {
        //console.log("🚀 ~ body:", body)
        try {
            const stores = await userDbController.app.getallstoresbycategory(body);
            //console.log("🚀 ~ stores:", stores)
            if (!Array.isArray(stores) || stores.length === 0) {
                return [];
            }

            const apiKey = process.env.GOOGLE_MAPS_KEY;

            let data = [];

            const new_array = Array.isArray(stores) ? stores.map((item) => item.store_id) : [];

            // --> convert stores to destinations list
            const destinations = stores.map(item => ({
                waypoint: {
                    location: {
                        latLng: {
                            latitude: item.latitude,
                            longitude: item.longitude
                        }
                    }
                }
            }));

            const apiBody = {
                origins: [{
                    waypoint: {
                        location: {
                            latLng: {
                                latitude: body.latitude,
                                longitude: body.longitude
                            }
                        }
                    }
                }],
                destinations: destinations,
                travelMode: "DRIVE"
            };

            // CALL API ONLY ONCE 🔥
            const response = await axios.post(
                "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
                apiBody,
                {
                    headers: {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": apiKey,
                        "X-Goog-FieldMask":
                            "originIndex,destinationIndex,distanceMeters,duration"
                    }
                }
            );

            const distances = response.data;
            //console.log("🚀 ~ distances:", distances)

            const reviewPromises = stores.map(item => userDbController.app.getstorereviews(item));
            const allReviews = await Promise.all(reviewPromises);

            const favouritePromises = user ? stores.map(item => userDbController.app.getfavourites(item.store_id, user.id)) : [];
            const allFavourites = await Promise.all(favouritePromises);

            for (let i = 0; i < stores.length; i++) {
                const item = stores[i];

                try {
                    item.images = typeof item.images === "string"
                        ? JSON.parse(item.images)
                        : item.images || [];
                } catch {
                    item.images = [];
                }

                const reviews = allReviews[i] || [];
                const favourites = user ? (allFavourites[i] || []) : [];

                // favourite logic
                const favouriteStoreIds = new Set(favourites.map(f => f.store_id));
                item.is_favourite = favouriteStoreIds.has(item.store_id);

                // rating
                const totalRatings = reviews.reduce((acc, r) => acc + r.rating, 0);
                item.averagerating = reviews.length ? totalRatings / reviews.length : 0;

                // distance mapping
                item.distance_m = distances[i]?.distanceMeters ?? null;
                item.distance_km = item.distance_m ? (item.distance_m / 1000).toFixed(2) : null;
                item.duration_ms = distances[i]?.duration
                    ? parseFloat(distances[i].duration.replace("s", "")) * 1000
                    : null;
                data.push(item);
            }


            return data;

        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong();
        }
    },
    addwallet: async ({ body, user }) => {
        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body.response;

            const updatewallet = await userDbController.app.addwallet(body, user.id);

            const amount = body.amount;

            const type = 'credit'

            const description = "amount added to wallet"

            const updatelogs = await userDbController.app.addlogs(amount, user.id, type, description);

            return "wallet added sucssesfully"
        } catch (error) {
            throw Error.SomethingWentWrong();
        }
    },
    getallcategory: async ({ body, user }) => {
        try {
            const res = await userDbController.app.getallcategory(body);

            if (!res || res.length == 0) {
                throw Error.SomethingWentWrong("No Category Found")
            }

            return res
        } catch (error) {
            throw Error.SomethingWentWrong();
        }
    },
    deleteuser: async ({ body, user }) => {
        try {
            const res = await userDbController.app.deleteuser(body, user.id);

            if (!res) {
                throw Error.SomethingWentWrong("could not delete user")
            }

            return "User deleted successfully"
        } catch (error) {
            throw Error.SomethingWentWrong("could not delete user")
        }
    },
    topsaloons: async ({ body, user }) => {
        try {
            // Get favourites only if user exists
            const favouritesarray = user
                ? (await userDbController.app.getfavourites_1(user.id))?.map(i => i.store_id) || []
                : [];

            const res = await userDbController.app.topsaloons(body);

            const data = await Promise.all(
                res.map(async (item) => {

                    // Parse images
                    if (typeof item.images === "string") {
                        try {
                            item.images = JSON.parse(item.images);
                        } catch {
                            item.images = [];
                        }
                    }

                    // Get reviews
                    const reviews = await userDbController.app.getstorereviews(item);

                    // Calculate average rating
                    const totalRatings = reviews.reduce((sum, r) => sum + r.rating, 0);
                    item.averagerating = reviews.length ? totalRatings / reviews.length : 0;

                    // Favourite logic
                    item.is_favourite = favouritesarray.includes(item.store_id);

                    return item;
                })
            );

            return data;

        } catch (error) {
            console.log("🚀 ~ error:", error);
            throw Error.SomethingWentWrong("could not get top saloons");
        }
    },
    cretae_order_wallet: async ({ body, user }) => {
        try {
            const amount = parseInt(body.amount) * 100;
            const currency = 'INR';
            const res = await razorpay.orders.create({ amount, currency })
            const razorpay_id = res.id


            return { order_id: razorpay_id }

        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong();
        }
    },
    getactivecoupons: async ({ body, user }) => {
        try {
            const getcoupons = await userDbController.app.getactivecoupons(body, user.id);

            if (!getcoupons || getcoupons.length == 0) {
                return []
            }

            for (const item of getcoupons) {
                item.id = item.id;
                item.used_count = 0;
                const usageCount = await userDbController.app.getCouponUsageCount(item, user.id);
                item.used_count = usageCount;
            }

            const filteredCoupons = getcoupons.filter(coupon => {
                if (parseInt(coupon.usage_limit) && parseInt(coupon.usage_limit) > 0) {
                    return coupon.used_count < parseInt(coupon.usage_limit);
                }
                return true; // Include coupons with no usage limit
            });


            return filteredCoupons;
        } catch (error) {
            //console.log("🚀 ~ getactivecoupons: ~ error:", error)
            throw Error.SomethingWentWrong("could not get active coupons")
        }

    },
    validatecoupon: async ({ body, user }) => {
        try {
            const getcoupon = await userDbController.app.validatecoupon(body, user.id);

            if (!getcoupon || getcoupon === null || getcoupon === undefined) {
                return "The coupon is Invalid or has expired"
            }

            return getcoupon;
        } catch (error) {
            throw Error.SomethingWentWrong("could not validate coupon")
        }
    },
    getstoresbyserach: async ({ body, user }) => {
        console.log("🚀 ~ body:", body)
        try {
            if (user !== null && user !== undefined) {
                const { latitude, longitude } = body;
                if (!latitude || !longitude) {
                    throw Error.SomethingWentWrong("Latitude and Longitude are required");
                }



                const max_radius_m = 500000

                const dLat = max_radius_m / 111045;
                const dLng = max_radius_m / (111045 * Math.cos(latitude * Math.PI / 180));
                const minLat = latitude - dLat, maxLat = latitude + dLat;
                const minLng = longitude - dLng, maxLng = longitude + dLng;

                console.log("🚀 ~ search params:", {
                    latitude, longitude, minLat, maxLat, minLng, maxLng, search: body.search
                });

                const nearbyStores = await userDbController.app.getnearbystorebyserach(latitude, longitude, minLat, maxLat, minLng, maxLng, body.search);
                console.log("🚀 ~ nearbyStores:", nearbyStores)


                const fetchallstores = await userDbController.app.getallfavourites(user.id);




                const new_array = Array.isArray(fetchallstores) ? fetchallstores.map((item) => item.store_id) : [];

                const storePromises = nearbyStores.map(store => {
                    // Parse images if it's a string
                    if (typeof store.images === "string") {
                        try {
                            store.images = JSON.parse(store.images);
                        } catch (parseError) {
                        }
                    }


                    // Return a promise for each store
                    return userDbController.app.getstorereviews(store)
                        .then(reviews => {
                            // Calculate average rating 
                            store.is_favourite = new_array.includes(store.store_id) ? true : false;
                            const totalRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
                            const averageRating = reviews.length ? totalRatings / reviews.length : 0;
                            store.averagerating = averageRating;
                            return store;
                        })
                        .catch(error => {
                            store.averagerating = 0;
                            return store;
                        });
                });

                // Wait for all store promises to resolve
                const stores = await Promise.all(storePromises);

                return stores;
            } else {
                const { latitude, longitude } = body;
                if (!latitude || !longitude) {
                    throw Error.SomethingWentWrong("Latitude and Longitude are required");
                }



                const max_radius_m = 500000;

                const dLat = max_radius_m / 111045;
                const dLng = max_radius_m / (111045 * Math.cos(latitude * Math.PI / 180));
                const minLat = latitude - dLat, maxLat = latitude + dLat;
                const minLng = longitude - dLng, maxLng = longitude + dLng;

                const nearbyStores = await userDbController.app.getnearbystorebyserach(latitude, longitude, minLat, maxLat, minLng, maxLng, body.search);
                console.log("🚀 ~ nearbyStores:", nearbyStores)

                const storePromises = nearbyStores.map(store => {
                    if (typeof store.images === "string") {
                        try {
                            store.images = JSON.parse(store.images);
                        } catch (parseError) {
                        }
                    }

                    return userDbController.app.getstorereviews(store)
                        .then(reviews => {
                            store.is_favourite = false;
                            const totalRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
                            const averageRating = reviews.length ? totalRatings / reviews.length : 0;
                            store.averagerating = averageRating;
                            return store;
                        })
                        .catch(error => {
                            store.averagerating = 0;
                            return store;
                        });
                });


                const stores = await Promise.all(storePromises);

                return stores;
            }
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("could not get nearby stores")
        }
    },
    getstoreservices: async ({ body, user }) => {
        console.log("🚀 ~ body:", body)
        try {
            if (user !== null) {
                const { latitude, longitude } = body;
                if (!latitude || !longitude) {
                    throw Error.SomethingWentWrong("Latitude and Longitude are required");
                }



                const max_radius_m = 500000

                const dLat = max_radius_m / 111045;
                const dLng = max_radius_m / (111045 * Math.cos(latitude * Math.PI / 180));
                const minLat = latitude - dLat, maxLat = latitude + dLat;
                const minLng = longitude - dLng, maxLng = longitude + dLng;

                console.log("🚀 ~ search params:", {
                    latitude, longitude, minLat, maxLat, minLng, maxLng, search: body.search
                });

                const nearbyStores = await userDbController.app.getnearbystoreservice(latitude, longitude, minLat, maxLat, minLng, maxLng, body.service);
                console.log("🚀 ~ nearbyStores:", nearbyStores)


                const fetchallstores = await userDbController.app.getallfavourites(user.id);




                const new_array = Array.isArray(fetchallstores) ? fetchallstores.map((item) => item.store_id) : [];

                const storePromises = nearbyStores.map(store => {
                    // Parse images if it's a string
                    if (typeof store.images === "string") {
                        try {
                            store.images = JSON.parse(store.images);
                        } catch (parseError) {
                        }
                    }


                    // Return a promise for each store
                    return userDbController.app.getstorereviews(store)
                        .then(reviews => {
                            // Calculate average rating 
                            store.is_favourite = new_array.includes(store.store_id) ? true : false;
                            const totalRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
                            const averageRating = reviews.length ? totalRatings / reviews.length : 0;
                            store.averagerating = averageRating;
                            return store;
                        })
                        .catch(error => {
                            store.averagerating = 0;
                            return store;
                        });
                });

                // Wait for all store promises to resolve
                const stores = await Promise.all(storePromises);

                return stores;
            } else {
                const { latitude, longitude } = body;
                if (!latitude || !longitude) {
                    throw Error.SomethingWentWrong("Latitude and Longitude are required");
                }

                // const max_radius = await userDbController.app.getmaxradius(body);

                const max_radius_m = 5000

                const dLat = max_radius_m / 111045;
                const dLng = max_radius_m / (111045 * Math.cos(latitude * Math.PI / 180));
                const minLat = latitude - dLat, maxLat = latitude + dLat;
                const minLng = longitude - dLng, maxLng = longitude + dLng;

                const nearbyStores = await userDbController.app.getnearbystorebyserach(latitude, longitude, minLat, maxLat, minLng, maxLng);

                const storePromises = nearbyStores.map(store => {
                    if (typeof store.images === "string") {
                        try {
                            store.images = JSON.parse(store.images);
                        } catch (parseError) {
                        }
                    }

                    return userDbController.app.getstorereviews(store)
                        .then(reviews => {
                            store.is_favourite = false;
                            const totalRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
                            const averageRating = reviews.length ? totalRatings / reviews.length : 0;
                            store.averagerating = averageRating;
                            return store;
                        })
                        .catch(error => {
                            store.averagerating = 0;
                            return store;
                        });
                });


                const stores = await Promise.all(storePromises);

                return stores;
            }
        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("could not get nearby stores")
        }
    },
    getstorebusearch: async ({ body, user }) => {
        try {

        } catch (error) {
            throw Error.SomethingWentWrong("could not search store")
        }
    },
    getwalletamount: async ({ body, user }) => {
        try {
            const getwallet = userDbController.app.getwalletamount(body, user.id);

            if (!getwallet) {
                throw Error.SomethingWentWrong("could not get wallet")
            }

            return getwallet
        } catch (error) {
            throw Error.SomethingWentWrong();
        }
    },
    getnearbystores: async ({ body, user }) => {
        try {
            if (user !== null && user !== undefined) {
                const { latitude, longitude } = body;
                if (!latitude || !longitude) {
                    throw Error.SomethingWentWrong("Latitude and Longitude are required");
                }

                const max_radius = await userDbController.app.getmaxradius(body);

                const max_radius_m = 500000

                const dLat = max_radius_m / 111045;
                const dLng = max_radius_m / (111045 * Math.cos(latitude * Math.PI / 180));
                const minLat = latitude - dLat, maxLat = latitude + dLat;
                const minLng = longitude - dLng, maxLng = longitude + dLng;

                const nearbyStores = await userDbController.app.getnearbystores(latitude, longitude, minLat, maxLat, minLng, maxLng);


                const fetchallstores = await userDbController.app.getallfavourites(user.id);




                const new_array = Array.isArray(fetchallstores) ? fetchallstores.map((item) => item.store_id) : [];

                const storePromises = nearbyStores.map(store => {
                    // Parse images if it's a string
                    if (typeof store.images === "string") {
                        try {
                            store.images = JSON.parse(store.images);
                        } catch (parseError) {
                        }
                    }


                    return userDbController.app.getstorereviews(store)
                        .then(reviews => {
                            // Calculate average rating 
                            store.is_favourite = new_array.includes(store.store_id) ? true : false;
                            const totalRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
                            const averageRating = reviews.length ? totalRatings / reviews.length : 0;
                            store.averagerating = averageRating;
                            return store;
                        })
                        .catch(error => {
                            store.averagerating = 0;
                            return store;
                        });
                });

                const stores = await Promise.all(storePromises);

                return stores;
            } else {
                const { latitude, longitude } = body;
                if (!latitude || !longitude) {
                    throw Error.SomethingWentWrong("Latitude and Longitude are required");
                }

                const max_radius = await userDbController.app.getmaxradius(body);

                const max_radius_m = max_radius

                const dLat = max_radius_m / 111045;
                const dLng = max_radius_m / (111045 * Math.cos(latitude * Math.PI / 180));
                const minLat = latitude - dLat, maxLat = latitude + dLat;
                const minLng = longitude - dLng, maxLng = longitude + dLng;

                const nearbyStores = await userDbController.app.getnearbystores(latitude, longitude, minLat, maxLat, minLng, maxLng);

                const storePromises = nearbyStores.map(store => {
                    if (typeof store.images === "string") {
                        try {
                            store.images = JSON.parse(store.images);
                        } catch (parseError) {
                        }
                    }

                    return userDbController.app.getstorereviews(store)
                        .then(reviews => {
                            store.is_favourite = false;
                            const totalRatings = reviews.reduce((acc, review) => acc + review.rating, 0);
                            const averageRating = reviews.length ? totalRatings / reviews.length : 0;
                            console.log("🚀 ~ averageRating:", averageRating)
                            store.averagerating = averageRating;
                            return store;
                        })
                        .catch(error => {
                            store.averagerating = 0;
                            return store;
                        });
                });


                const stores = await Promise.all(storePromises);

                return stores;
            }

        } catch (error) {
            console.log("🚀 ~ error:", error)
            throw Error.SomethingWentWrong("could not get nearby stores")
        }
    },


    // this version2 of middleware
    // get banner 
    getBannerV2: async () => {
        try {
            const banners = await userDbController.Models.Banner.findAll({
                where: {
                    status: "active",
                    place: "user",
                },
                attributes: ["id", "image"],
                raw: true,
            });
            console.log(banners);
            if (!banners || banners.length === 0) {
                return [];
            }

            return banners.map((item, index) => ({
                id: item.id,
                imageUrl: item.image,
            }));

        } catch (error) {
            throw new Error("Failed to fetch banners");
        }
    },

    getnearbystoresv2: async ({ body, user }) => {
        const { lat, lng, gender, page, limit } = body;

        if (!lat || !lng) {
            throw Error.SomethingWentWrong("lat and lng are required");
        }
        const parsedPage = page ? Math.max(1, Number(page)) : 1;
        const parsedLimit = limit ? Math.max(1, Number(limit)) : 10;
        const radius = 10;

        // Gender filter logic:
        // male -> male + unisex salons
        // female -> female + unisex salons
        // unisex -> unisex salons only
        let genderFilter = null;
        if (gender) {
            const g = gender.toLowerCase().trim();
            if (g === "male" || g === "female" || g === "unisex") {
                genderFilter = g;
            }
        }

        const { rawData, totalRecords } = await userDbController.app.getNearbyStoresv2({
            latitude: lat,
            longitude: lng,
            gender: genderFilter,
            radius,
            user_id: user?.id || null,
            limit: parsedLimit,
            page: parsedPage
        });

        const totalPages = Math.ceil(totalRecords / parsedLimit);

        return {
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                totalRecords,
                totalPages
            },
            data: formatNearbyStores(rawData)
        };
    },

    getAllSalons: async (params) => {
    let result = await userDbController.app.getAllSalons(params);

    // Fallback if no nearby results
    if (params.lat && params.lng && result.rawData.length === 0) {
        result = await userDbController.app.getAllSalons({
        ...params,
        lat: null,
        lng: null
        });
    }

    return formatSalonList({
        rawData: result.rawData,
        page: params.page,
        limit: params.limit,
        totalRecords: result.totalRecords,
        lat: params.lat,
        lng: params.lng
    });
    },
    // getTopSalons: async ({ limit, page, gender, userId, lat, lng }) => {

    //     const { rawData, totalRecords } =
    //         await userDbController.app.getTopSalons({
    //             limit,
    //             page,
    //             gender,
    //             userId,
    //             lat,
    //             lng
    //         });

    //     return formatTopSalons({
    //         rawData,
    //         page,
    //         limit,
    //         totalRecords,
    //         lat,
    //         lng
    //     });
    // },
    // Favourite module middleware
    // CRUD favourites
    getMapMarkersClustered: async ({ body, user }) => {
        try {
            const { bounds, zoom, filters = {}, limit = 500 } = body;

            // Validate required fields
            if (!bounds || !bounds.northEast || !bounds.southWest || !zoom) {
                throw Error.BadRequest("bounds and zoom are required");
            }

            const userId = user && user.id ? user.id : null;

            // Get all markers from database
            const markers = await userDbController.app.getMapMarkers({
                bounds,
                filters,
                userId
            });

            // Apply limit
            const limitedMarkers = markers.slice(0, limit);

            // Clustering logic based on zoom level
            const CLUSTER_ZOOM_THRESHOLD = 14;
            const clusteringEnabled = zoom < CLUSTER_ZOOM_THRESHOLD;

            let response;

            if (clusteringEnabled) {
                // Perform clustering using grid-based algorithm
                const clusters = performClustering(limitedMarkers, zoom, bounds);

                response = {
                    success: true,
                    zoom,
                    clusteringEnabled: true,
                    data: {
                        clusters: clusters.clusters,
                        markers: clusters.outliers // Individual markers not in clusters
                    },
                    totalCount: markers.length,
                    timestamp: new Date().toISOString()
                };
            } else {
                // Return individual markers
                response = {
                    success: true,
                    zoom,
                    clusteringEnabled: false,
                    data: {
                        clusters: [],
                        markers: limitedMarkers.map(m => ({
                            id: m.id,
                            type: "marker",
                            name: m.name,
                            lat: parseFloat(m.lat),
                            lng: parseFloat(m.lng),
                            rating: parseFloat(m.rating),
                            isPremium: Boolean(m.isPremium),
                            isFavorite: Boolean(m.isFavorite)
                        }))
                    },
                    totalCount: markers.length,
                    timestamp: new Date().toISOString()
                };
            }

            return response;
        } catch (error) {
            console.error("Error in getMapMarkersClustered:", error);
            if (error.status) throw error;
            throw Error.SomethingWentWrong("Failed to fetch map markers");
        }
    },

    getTopSalons: async (filters) => {

        const { page, limit, lat, lng } = filters;

        const offset = (page - 1) * limit;

        // Bounding box optimization
        if (filters.lat !== null && filters.lng !== null) {
            const EARTH_RADIUS = 6371;
            const radius = 5;

            const lat = filters.lat;
            const lng = filters.lng;

            const latDelta = (radius / EARTH_RADIUS) * (180 / Math.PI);
            const lngDelta =
                (radius / (EARTH_RADIUS * Math.cos(lat * Math.PI / 180))) *
                (180 / Math.PI);

            filters.minLat = lat - latDelta;
            filters.maxLat = lat + latDelta;
            filters.minLng = lng - lngDelta;
            filters.maxLng = lng + lngDelta;
        }

        const { rawData, totalRecords } =
            await userDbController.app.getTopSalons({
                ...filters,
                offset
            });

        return formatTopSalons({
            rawData,
            page,
            limit,
            totalRecords,
            lat,
            lng
        });
    },
    toggleFavourite: async (storeId, userId) => {

        if (!storeId) {
            return {
                status: 400,
                success: false,
                message: "store_id is required"
            };
        }
        // Validate store exists
        const store = await userDbController.app.validateStore(storeId);
        if (!store) {
            return {
                status: 404,
                success: false,
                message: "Store not found or inactive"
            };
        }
        const existing = await userDbController.app.findByStoreAndUser(storeId, userId);

        if (existing && existing.status === "active") {

            await userDbController.app.updateStatus(storeId, userId, "inactive");

            return {
                status: 200,
                success: true,
                message: "Store removed from favourites"
            };
        }

        // If exists but inactive → reactivate
        if (existing && existing.status === "inactive") {
            await userDbController.app.updateStatus(storeId, userId, "active");


            return {
                status: 200,
                success: true,
                message: "Store added to favourites"
            };
        }
        // If no record → create
        await userDbController.app.create(storeId, userId);

        return {
            status: 201,
            success: true,
            message: "Store added to favourites"
        };
    },
    getFavourites: async (userId) => {

        const data = await userDbController.app.getUserFavourites(userId);

        return {
            status: 200,
            success: true,
            message: "Favourites fetched successfully",
            data: formatNearbyStores(data)
        };
    },

    removeFavourite: async (storeId, userId) => {

        const existing = await userDbController.app.findActive(storeId, userId);

        if (!existing) {
            return {
                status: 404,
                success: false,
                message: "Favourite not found"
            };
        }

        await userDbController.app.updateStatus(storeId, userId, "inactive");

        return {
            status: 200,
            success: true,
            message: "Favourite removed successfully"
        };
    },
    // get category 
    getAllCategoryV2: async () => {
        try {
            const categories = await userDbController.Models.category.findAll({
                where: { status: "active" },
                attributes: ["id", "name", "image"],
                order: [["id", "DESC"]],
                raw: true,
            });

            if (!categories || categories.length === 0) {
                return [];
            }

            return categories.map((item, index) => ({
                id: item.id,
                label: item.name,
                imageUrl: item.image || null,
            }));

        } catch (error) {
            throw new Error("Failed to fetch categories");
        }
    },

    getstoredetailsv2: async ({ body }) => {
        try {

            const { store_id, sex } = body;

            if (!store_id) {
                throw Error.SomethingWentWrong("Salon ID is required");
            }

            const [
                store,
                services,
                stylists,
                reviews,
                languages,
                slots,
                amenities,
                ratingData,
                workingHours
            ] = await Promise.all([
                userDbController.app.getStoreBasicDetailsv2(store_id),
                userDbController.app.getStoreServicesv2(store_id, sex),
                userDbController.app.getStylistsv2(store_id),
                userDbController.app.getReviewsv2(store_id),
                userDbController.app.getStoreLanguagesv2(store_id),
                userDbController.app.getSlotsv2(store_id),
                userDbController.app.getAmenitiesv2(store_id),
                userDbController.app.getRatingSummaryv2(store_id),
                userDbController.app.getWorkingHoursv2(store_id)
            ]);

            if (!store) {
                throw Error.NotFound("Salon not found");
            }
            console.log("Raw languages from DB:", languages);
            return formatSalonResponse({
                store,
                services,
                stylists,
                reviews,
                languages,
                slots,
                amenities,
                ratingData,
                workingHours
            });

        } catch (error) {
            throw Error.SomethingWentWrong(error.message);
        }
    },

    getTopCategoryServicesBySex: async ({ body }) => {
        try {

            const { sex } = body;

            const services =
            await userDbController.app.getTopCategoryServicesBySex(
                sex || "male"
            );

            return services;

        } catch (error) {

            throw Error.SomethingWentWrong(error.message);
        }
    },

    // Get Stores By Category
    getStoresByServiceCategory: async (req) => {

    try {

        const body = req.body || {};
        const query = req.query || {};
        const { category_id, sex, budget, rating } = body;

        const parsedLat =
            body.lat ?? body.latitude ?? query.lat ?? query.latitude;
        const parsedLng =
            body.lng ?? body.longitude ?? query.lng ?? query.longitude;

        const stores =
        await userDbController.app.getStoresByServiceCategory(
            {
                categoryId: category_id,
                sex,
                budget,
                rating,
                lat:
                    parsedLat != null && parsedLat !== "" && !isNaN(Number(parsedLat))
                        ? Number(parsedLat)
                        : null,
                lng:
                    parsedLng != null && parsedLng !== "" && !isNaN(Number(parsedLng))
                        ? Number(parsedLng)
                        : null,
            }
        );

        return formatNearbyStores(stores);

    } catch (error) {

        throw Error.SomethingWentWrong(error.message);
    }
    },

    // getactivecouponv2: async (req,user) => {
    //     try {
    //         // const userId = 1; // Temporary bypass for testing
    //         const getcoupons = await userDbController.app.getactivecoupons();
    //         console.log("Raw coupons from DB:", JSON.stringify(getcoupons, null, 2));

    //         if (!getcoupons || getcoupons.length == 0) {
    //             return []
    //         }

    //         const couponPromises = getcoupons.map(async (item) => {
    //             const usageCount = await userDbController.app.getCouponUsageCount(item, user);
    //             const couponData = item.get ? item.get({ plain: true }) : item;
    //             return {
    //                 ...couponData,
    //                 used_count: usageCount
    //             };
    //         });

    //         const couponsWithUsage = await Promise.all(couponPromises);

    //         const filteredCoupons = couponsWithUsage.filter(coupon => {
    //             if (parseInt(coupon.usage_limit) && parseInt(coupon.usage_limit) > 0) {
    //                 return coupon.used_count < parseInt(coupon.usage_limit);
    //             }
    //             return true;
    //         });

    //         return formatCouponResponse(filteredCoupons);

    //     } catch (error) {
    //         console.error("Error in getactivecouponv2:", error);
    //         throw Error.SomethingWentWrong("could not get active coupons");
    //     }
    // },
    getactivecouponv2: async (req) => {
        try {
            const userId = req.user.id;

            const getcoupons = await userDbController.app.getactivecoupons();
            if (!getcoupons?.length) return [];

            const couponPromises = getcoupons.map(async (item) => {
                const couponData = item.get ? item.get({ plain: true }) : item;

                const usageCount = await userDbController.app.getCouponUsageCountv2(
                    couponData.id,
                    userId
                );

                return {
                    ...couponData,
                    used_count: usageCount || 0
                };
            });

            const couponsWithUsage = await Promise.all(couponPromises);

            const filteredCoupons = couponsWithUsage.filter(coupon => {
                const limit = Number(coupon.usage_limit);
                if (!isNaN(limit) && limit > 0) {
                    return coupon.used_count < limit;
                }
                return true;
            });

            return formatCouponResponse(filteredCoupons);

        } catch (error) {
            console.error("Error in getactivecouponv2:", error);
            throw Error.SomethingWentWrong("could not get active coupons");
        }
    },
    addGuestDetails: async ({ body, user }) => {
        try {
            const { name, gender, age, phone } = body;
            if (!name || !gender || !age || !phone) {
                throw Error.SomethingWrong("name, gender, age and phone are required");
            }

            // const userId = 36; // Constant userId for testing
            return await userDbController.app.addGuestDetails(body, user.id);
        } catch (error) {
            throw Error.SomethingWentWrong(error.message);
        }
    },

    getGuestDetails: async (user) => {
        try {
            // const userId = 36; // Constant userId for testing
            return await userDbController.app.getGuestDetails(user.id);
        } catch (error) {
            throw Error.SomethingWentWrong(error.message);
        }
    },
    updateGuestDetails: async (req) => {
        try {
            const { guestId, name, gender, age, phone, status} = req.body;
            const userId = req.user.id;
            console.log("guestId:", guestId);
                console.log("user_id:", userId);
                console.log("BODY:",req.body);

            if (!guestId) {
                console.log(guestId)
                throw Error.BadRequest("guestId is required");
            }

            // At least one field should be provided for update
            if (!name && !gender && !age && !phone && !status) {
                throw Error.BadRequest("At least one field (name, gender, age, phone, status) is required for update");
            }

            return await userDbController.app.updateGuestDetails(guestId, req.body, userId);
        } catch (error) {
            if (error.status) throw error;
            throw Error.SomethingWentWrong(error.message);
        }
    },
    getProfileV2: async ({ user }) => {
        try {
            if (!user || !user.id) {
                throw Error.Unauthorized("User not authenticated");
            }
            const profile = await userDbController.app.getProfileV2(user.id);
            if (!profile) {
                throw Error.NotFound("User profile not found");
            }
            return profile;
        } catch (error) {
            console.error("Error in getProfileV2 middleware:", error);
            if (error.status) throw error;
            throw Error.SomethingWentWrong("Failed to fetch profile");
        }
    },
    updateProfileV2: async ({ body, file, user }) => {
        try {
            if (!user || !user.id) {
                throw Error.Unauthorized("User not authenticated");
            }

            const { firstname, lastname, email, phone, age, gender, dob, city, country } = body;
            const profilePic = file ? file.path : body.profilePic;

            // Basic validation
            if (email && !/^\S+@\S+\.\S+$/.test(email)) {
                throw Error.BadRequest("Invalid email format");
            }

            const updateData = { firstname, lastname, email, phone, age, gender, dob, city, country, profilePic };

            const success = await userDbController.app.updateProfileV2(user.id, updateData);
            if (!success) {
                throw Error.SomethingWentWrong("Failed to update profile");
            }

            return "Profile updated successfully";
        } catch (error) {
            console.error("Error in updateProfileV2 middleware:", error);
            if (error.status) throw error;
            throw Error.SomethingWentWrong("Failed to update profile");
        }
    },
    deleteUserV2: async ({ user }) => {
        try {
            if (!user || !user.id) {
                throw Error.Unauthorized("User not authenticated");
            }

            const success = await userDbController.app.deleteUserV2(user.id);
            if (!success) {
                throw Error.SomethingWentWrong("Failed to delete user account");
            }

            return "Account deleted successfully";
        } catch (error) {
            console.error("Error in deleteUserV2 middleware:", error);
            if (error.status) throw error;
            throw Error.SomethingWentWrong("Failed to delete account");
        }
    },

}
