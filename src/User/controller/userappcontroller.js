import dotenv from "dotenv";
import { ApplicationResponse } from "../../core/inc/response/ApplicationResponse.js";
import { ApplicationResult } from "../../core/result.js";
import { userappmiddleware } from "../middleware/appmiddleware.js";
dotenv.config();


export const getprofile = async (req, res) => {
  userappmiddleware.user.getprofile(req.user)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const getallstores = async (req, res) => {
  userappmiddleware.user.getallstores(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addfavourites = async (req, res) => {
  userappmiddleware.user.addfavourites(req.body, req.user)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const getfavourites = async (req, res) => {
  userappmiddleware.user.getfavourites(req.user)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const deletefavourites = async (req, res) => {
  userappmiddleware.user.deletefavourites(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};



export const addreview = async (req, res) => {
  userappmiddleware.user.addreview(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getallreview = async (req, res) => {
  userappmiddleware.user.getallreview(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const updaterating = async (req, res) => {
  userappmiddleware.user.updaterating(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const deletereview = async (req, res) => {
  userappmiddleware.user.deletereview(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getinvitecode = async (req, res) => {
  userappmiddleware.user.getinvitecode(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const verifyinvitecode = async (req, res) => {
  userappmiddleware.user.verifyinvitecode(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const initiaterefund = async (req, res) => {
  userappmiddleware.user.initiaterefund(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const updatebooking = async (req, res) => {
  userappmiddleware.user.updatebooking(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const gettransactions = async (req, res) => {
  userappmiddleware.user.getransactions(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getnotification = async (req, res) => {
  userappmiddleware.user.getnotification(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const getbanner = async (req, res) => {
  userappmiddleware.user.getbanner(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getstorebyid = async (req, res) => {
  userappmiddleware.user.getstorebyid(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getslotsbydate = async (req, res) => {
  userappmiddleware.user.getslotsbydate(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addtocart = async (req, res) => {
  userappmiddleware.user.addtocart(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const createorder = async (req, res) => {
  userappmiddleware.user.createorder(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const createInternalOrder = async (req, res) => {
  userappmiddleware.user.createInternalOrder(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const createRazorpayOrder = async (req, res) => {
  //console.log("req.body",req.body);
  userappmiddleware.user.createRazorpayOrder(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const paymentsucssess = async (req, res) => {
  userappmiddleware.user.paymentsucssess(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getallappoinments = async (req, res) => {
  userappmiddleware.user.getallappoinments(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getstorebycategory = async (req, res) => {
  userappmiddleware.user.getstorebycategory(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getallcategory = async (req, res) => {
  userappmiddleware.user.getallcategory(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const deleteuser = async (req, res) => {
  userappmiddleware.user.deleteuser(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const topsaloons = async (req, res) => {
  userappmiddleware.user.topsaloons(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const getactiveactivecoupons = async (req, res) => {
  userappmiddleware.user.getactivecoupons(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const validatecoupon = async (req, res) => {
  userappmiddleware.user.validatecoupon(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};




export const getstorebysearch = async (req, res) => {
  userappmiddleware.user.getstoresbyserach(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};



export const getstorebyservices = async (req, res) => {
  userappmiddleware.user.getstoreservices(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const create_order_wallet = async (req, res) => {
  userappmiddleware.user.cretae_order_wallet(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const getwalletamount = async (req, res) => {
  userappmiddleware.user.getwalletamount(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};


export const getnearbystores = async (req, res) => {
  userappmiddleware.user.getnearbystores(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};



export const addwallet = async (req, res) => {
  userappmiddleware.user.addwallet(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
}

// -----------------------------version 2--------------------------------


// this function is version2 endpoints 
// this is get banner controller 
export const getBannerV2 = async (req, res) => {
  try {
    console.log('api started')
    const banners = await userappmiddleware.user.getBannerV2();
    return res.status(200).json({
      success: true,
      data: banners,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};


// get category controller
export const fetchAllCategoryV2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.getAllCategoryV2();

    return res.status(200).json({
      success: true,
      data,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};


//get nearby stores
export const getnearbystoresv2 = async (req, res) => {
  try {
    const { lat, lng, gender, page, limit } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: "Latitude and Longitude are required"
      });
    }

    // Pass user object to middleware
    const data = await userappmiddleware.user.getnearbystoresv2({
      body: req.body,
      user: req.user || null
    });

    return res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    console.error("getnearbystoresv2 error:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Something went wrong"
    });
  }
};

export const createRazorpayOrderV2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.createRazorpayOrderV2(req);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Something went wrong"
    });
  }
};

export const getAllSalons = async (req, res) => {
  try {
    const startTime = Date.now();

    let { page, limit, gender, category, lat, lng, search } = req.query;

    // Pagination validation
    const parsedPage = page ? Math.max(1, Number(page)) : 1;
    let parsedLimit = limit ? Math.max(1, Number(limit)) : 10;

    if (page && (isNaN(parsedPage) || !Number.isInteger(Number(page)))) {
      return res.status(400).json({ success: false, message: "Invalid page" });
    }

    if (limit && (isNaN(parsedLimit) || !Number.isInteger(Number(limit)))) {
      return res.status(400).json({ success: false, message: "Invalid limit" });
    }

    const MAX_LIMIT = 50;
    if (parsedLimit > MAX_LIMIT) parsedLimit = MAX_LIMIT;

    // Validate lat/lng properly
    const parsedLat = lat && !isNaN(Number(lat)) ? Number(lat) : null;
    const parsedLng = lng && !isNaN(Number(lng)) ? Number(lng) : null;

    // Gender handling
    let genderFilter = null;
    if (gender) {
      const g = gender.toLowerCase();
      if (g === "male" || g === "female") {
        genderFilter = g;
      } else if (g === "unisex") {
        genderFilter = null;
      } else {
        return res.status(400).json({ success: false, message: "Invalid gender" });
      }
    }

    const result = await userappmiddleware.user.getAllSalons({
      page: parsedPage,
      limit: parsedLimit,
      gender: genderFilter,
      category: category ? Number(category) : null,
      lat: parsedLat,
      lng: parsedLng,
      search: search || null,
      userId: req.user?.id || null
    });

    console.log(`Execution time: ${Date.now() - startTime}ms`);

    return res.status(200).json({
      success: true,
      pagination: result.pagination,
      data: result.data
    });

  } catch (error) {
    console.error("getAllSalons error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// export const getTopSalons = async (req, res) => {
//   try {
//     const startTime = Date.now();
//     let { limit, page, gender, lat, lng } = req.query;

//     const parsedPage = page ? Math.max(1, Number(page)) : 1;
//     let parsedLimit = limit ? Math.max(1, Number(limit)) : 10;

//     if (page && (isNaN(parsedPage) || !Number.isInteger(Number(page)))) {
//       return res.status(400).json({ success: false, message: "page must be a valid integer" });
//     }

//     if (limit && (isNaN(parsedLimit) || !Number.isInteger(Number(limit)))) {
//       return res.status(400).json({ success: false, message: "limit must be a valid integer" });
//     }

//     const MAX_LIMIT = 50;
//     if (parsedLimit > MAX_LIMIT) parsedLimit = MAX_LIMIT;

//     // Gender filter logic:
//     // male -> only male
//     // female -> only female
//     // unisex -> male, female, unisex
//     // null/invalid -> all
//     let genderFilter = null;
//     if (gender) {
//       const g = gender.toLowerCase().trim();
//       if (g === "male" || g === "female" || g === "unisex") {
//         genderFilter = g;
//       }
//     }

//     const result = await userappmiddleware.user.getTopSalons({
//       limit: parsedLimit,
//       page: parsedPage,
//       gender: genderFilter,
//       userId: req.user?.id || null,
//       lat: lat ? Number(lat) : null,
//       lng: lng ? Number(lng) : null
//     });

//     console.log(`getTopSalons executed in ${Date.now() - startTime}ms`);

//     return res.status(200).json({
//       success: true,
//       pagination: result.pagination,
//       data: result.data
//     });

//   } catch (error) {
//     console.error("getTopSalons error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error"
//     });
//   }
// };




export const getTopSalons = async (req, res) => {
  try {
    const startTime = Date.now();

    let {
      page = 1,
      limit = 10,
      gender,
      lat,
      lng,
      minRating,
      minPrice,
      maxPrice,
      search,
      sort
    } = req.query;

    page = parseInt(page);
    limit = Math.min(parseInt(limit), 50);

    if (isNaN(page) || page < 1) {
      return res.status(400).json({ success: false, message: "Invalid page" });
    }

    if (isNaN(limit) || limit < 1) {
      return res.status(400).json({ success: false, message: "Invalid limit" });
    }
    if ((lat && !lng) || (!lat && lng)) {
      return res.status(400).json({
        success: false,
        message: "Both lat and lng must be provided together"
      });
    }

    if (lat && lng) {
      if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
        return res.status(400).json({
          success: false,
          message: "Invalid latitude or longitude"
        });
      }
    }

    const filters = {
      page,
      limit,
      gender: gender?.toLowerCase() || null,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      minRating: minRating ? parseFloat(minRating) : null,
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      search: search ? `%${search}%` : null,
      sort: sort || null,
      userId: req.user?.id || null
    };

    const result = await userappmiddleware.user.getTopSalons(filters);

    console.log(`getTopSalons executed in ${Date.now() - startTime}ms`);

    return res.status(200).json({
      success: true,
      pagination: result.pagination,
      data: result.data
    });

  } catch (error) {
    console.error("getTopSalons error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Favouirtes module api 
// toggleFavourite - add fav, delete fav
// getFavourites - get all fav status-active
export const toggleFavourite = async (req, res) => {
  try {
    const { store_id } = req.body;
    const userId = req.user.id;


    const result = await userappmiddleware.user.toggleFavourite(store_id, userId);

    return res.status(result.status).json(result);

  } catch (error) {
    console.error("TOGGLE FAV ERROR:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      // message: "Internal server error"
      message: error.message || "Internal server error"
    });
  }
};

export const getFavourites = async (req, res) => {
  try {
    const userId = req.user.id;


    const result = await userappmiddleware.user.getFavourites(userId);

    return res.status(200).json(result);

  } catch (error) {
    console.error("GET FAV ERROR:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      // message: "Internal server error"
      message: error.message || "Internal server error"
    });
  }
};

export const removeFavourite = async (req, res) => {
  try {

    // if (!req.user || !req.user.id) {
    //   return res.status(401).json({
    //     status: 401,
    //     success: false,
    //     message: "Unauthorized"
    //   });
    // }

    const storeId = parseInt(req.query.store_id);
    const userId = req.user.id;

    if (!storeId) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: "store_id is required"
      });
    }

    const result = await userappmiddleware.user.removeFavourite(storeId, userId);

    return res.status(result.status).json(result);

  } catch (error) {
    console.error("DELETE ERROR:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: error.message
    });
  }
};


// get store details based store_id
export const getstoredetailsv2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.getstoredetailsv2(req);

    return res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message
    });
  }
};

export const getTopCategoryServicesBySex = async (req, res) => {

  try {

    const data =
      await userappmiddleware.user.getTopCategoryServicesBySex(req);

    return res.status(200).json({
      success: true,
      data,
    });

  } catch (error) {

    return res.status(error.status || 500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getStoresByServiceCategory = async (req, res) => {

  try {

    const data =
      await userappmiddleware.user.getStoresByServiceCategory(req);

    return res.status(200).json({
      success: true,
      data,
    });

  } catch (error) {

    return res.status(error.status || 500).json({
      success: false,
      message: error.message,
    });
  }
};

// get active coupons version 2
export const getactivecouponv2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.getactivecouponv2(req);

    return res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  }
};

export const addGuestDetails = async (req, res) => {
  userappmiddleware.user.addGuestDetails(req)
    .then((data) => {
      return res.status(200).json({
        success: true,
        message: "Guest details added successfully"
      });
    })
    .catch((error) => {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message
      });
    });
};

export const getReviewsV2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.getReviewsV2(req);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  }
};

export const updateReviewV2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.updateReviewV2(req);
    return res.status(200).json({
      success: true,
      message: data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  }
};

export const deleteReviewV2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.deleteReviewV2(req);
    return res.status(200).json({
      success: true,
      message: data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  }
};

export const getSlotStatusV2 = async (req, res) => {
  try {
    const { saloon_id, date } = req.query;

    if (!saloon_id || !date) {
      return res.status(400).json({
        success: false,
        message: "saloon_id and date are required"
      });
    }

    const data = await userappmiddleware.user.getSlotStatusV2(saloon_id, date);

    return res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.log("Error in getSlotStatusV2 controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

export const getGuestDetails = async (req, res) => {
  userappmiddleware.user.getGuestDetails(req.user)
    .then((data) => {
      return res.status(200).json({
        success: true,
        data
      });
    })
    .catch((error) => {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message
      });
    });
};

export const updateGuestDetails = async (req, res) => {
  userappmiddleware.user.updateGuestDetails(req)
    .then((data) => {
      return res.status(200).json({
        success: true,
        message: data.message
      });
    })
    .catch((error) => {
      return res.status(error.status || 500).json({
        success: false,
        message: error.message
      });
    });
};

export const getMapMarkersClustered = async (req, res) => {
  try {
    const response = await userappmiddleware.user.getMapMarkersClustered({
      body: req.body,
      user: req.user || null
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error("getMapMarkersClustered error:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Failed to fetch map markers"
    });
  }
};


export const getProfileV2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.getProfileV2(req);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  }
};

export const updateProfileV2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.updateProfileV2(req);
    return res.status(200).json({
      success: true,
      message: data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  }
};

export const deleteUserV2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.deleteUserV2(req);
    return res.status(200).json({
      success: true,
      message: data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  }
};

export const createOrderV2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.createOrderV2(req);
    return res.status(200).json({
      success: true,
      message: "Order created successfully",
      data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  }
};

export const paymentsuccessV2 = async (req, res) => {
  try {
    const data = await userappmiddleware.user.paymentsuccessV2(req);
    return res.status(200).json({
      success: true,
      message: data.message,
      data
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  }
};
