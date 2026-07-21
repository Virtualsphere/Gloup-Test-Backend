import dotenv from "dotenv";
import { ApplicationResponse } from "../../core/inc/response/ApplicationResponse.js";
import { ApplicationResult } from "../../core/result.js";
// import {par}
import { partnerappmiddleware } from "../middleware/partnerappmiddleware.js";
import { partnerDbController } from "../../core/database/Controller/partnerDbController.js";
dotenv.config();

export const createstore = async (req, res) => {
  partnerappmiddleware.addstore
    .createstore(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const updateStore = async (req, res) => {
  partnerappmiddleware.addstore
    .updateStore(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

/**
 * @description Controller for onboarding a salon (v2).
 * Proxies the request to the specialized onboarding middleware.
 */
export const onboardingsalon = async (req, res) => {
  partnerappmiddleware.addstore
    .onboardingsalon(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

/**
 * @description Controller for creating a store (v2).
 * Proxies the request to the specialized v2 middleware.
 */
export const createStoreV2 = async (req, res) => {
  partnerappmiddleware.addstore
    .createStoreV2(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

/**
 * @description Controller for updating store details (v2).
 * Proxies the request to the specialized v2 middleware.
 */
export const updateStoreV2 = async (req, res) => {
  partnerappmiddleware.addstore
    .updateStoreV2(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

export const addbankdetails = async (req, res) => {
  partnerappmiddleware.addstore
    .addbankdetails(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addstoreservices = async (req, res) => {
  partnerappmiddleware.addstore
    .addstoreervices(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addaminities = async (req, res) => {
  partnerappmiddleware.addstore
    .addaminities(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addownerprofile = async (req, res) => {
  partnerappmiddleware.addstore
    .addownerprofile(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getservicecategory = async (req, res) => {
  partnerappmiddleware.addstore
    .getservicecategory(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const editServiceCategory = async (req, res) => {
  partnerappmiddleware.addstore
    .editServiceCategory(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;

      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status)
      );

      res.json({ status: statuscode, data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const totalpayouts = async (req, res) => {
  partnerappmiddleware.addstore
    .totalpayouts(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getallnotification = async (req, res) => {
  partnerappmiddleware.addstore
    .getallnotification(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getactivesubs = async (req, res) => {
  partnerappmiddleware.addstore
    .getactivesubs(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const gettransactionlogs = async (req, res) => {
  partnerappmiddleware.addstore
    .gettransactionlogs(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const AddNewAminities = async (req, res) => {
  partnerappmiddleware.addstore
    .AddNewAminities(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getallaminities = async (req, res) => {
  partnerappmiddleware.addstore
    .getallaminities(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
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
  partnerappmiddleware.addstore
    .getbanner(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

// This function retrieves the banner along with its associated color for the partner application.
//  It calls the corresponding middleware function and returns the data in a structured JSON response.
// If any error occurs during the process, it catches the error and returns a 500 Internal Server Error response.
export const getBannerWithColor = async (req, res) => {
  try {
    const data = await partnerappmiddleware.addstore.getBannerWithColor();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("BannerWithColor Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getstoredetails = async (req, res) => {
  partnerappmiddleware.addstore
    .getstoredetails(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getownerprofile = async (req, res) => {
  partnerappmiddleware.addstore
    .getownerprofile(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addcombinations = async (req, res) => {
  partnerappmiddleware.addstore
    .addcombinations(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const updatecombinations = async (req, res) => {
  partnerappmiddleware.addstore
    .updatecombinations(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const deletecombos = async (req, res) => {
  partnerappmiddleware.addstore
    .deletecombos(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getcombos = async (req, res) => {
  partnerappmiddleware.addstore
    .getcombos(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getallcombos = async (req, res) => {
  partnerappmiddleware.addstore
    .getallcombos(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const listservices = async (req, res) => {
  partnerappmiddleware.addstore
    .listservices(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const deleteserivice = async (req, res) => {
  partnerappmiddleware.addstore
    .deleteservice(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const updateservice = async (req, res) => {
  partnerappmiddleware.addstore
    .updateservice(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addstoretimmings = async (req, res) => {
  partnerappmiddleware.addstore
    .addstoretimmings(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getstoretimmings = async (req, res) => {
  partnerappmiddleware.addstore
    .getstoretimmings(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addslots = async (req, res) => {
  partnerappmiddleware.addstore
    .addslots(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const listservicecategory = async (req, res) => {
  partnerappmiddleware.addstore
    .listservicecategory(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getstoreaminities = async (req, res) => {
  partnerappmiddleware.addstore
    .getstoreaminities(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addprofessional = async (req, res) => {
  partnerappmiddleware.addstore
    .addprofessional(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const updateproffesional = async (req, res) => {
  partnerappmiddleware.addstore
    .updateprofessional(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
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
  partnerappmiddleware.addstore
    .getallcategory(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const deleteproffesional = async (req, res) => {
  partnerappmiddleware.addstore
    .deleteproffesional(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getDashboardData = async (req, res) => {
  partnerappmiddleware.addstore
    .getDashboardData(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getallbookings = async (req, res) => {
  partnerappmiddleware.addstore
    .getallbookings(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const updatebookings = async (req, res) => {
  partnerappmiddleware.addstore
    .updatebooking(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const deletereviews = async (req, res) => {
  partnerappmiddleware.addstore
    .deletereviews(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const updatestoreimages = async (req, res) => {
  partnerappmiddleware.addstore
    .updatestoreimages(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addnewaminities = async (req, res) => {
  partnerappmiddleware.addstore
    .addnewaminities(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getotalsales = async (req, res) => {
  partnerappmiddleware.addstore
    .getotalsales(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const addplans = async (req, res) => {
  partnerappmiddleware.addstore
    .addplans(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const plansuccess = async (req, res) => {
  partnerappmiddleware.addstore
    .plansuccess(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getallimages = async (req, res) => {
  partnerappmiddleware.addstore
    .getallimages(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getsubscription = async (req, res) => {
  partnerappmiddleware.addstore
    .getsubscription(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const reviewdetailspage = async (req, res) => {
  partnerappmiddleware.addstore
    .reviewdetailspage(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getbankdetails = async (req, res) => {
  partnerappmiddleware.addstore
    .getbankdetails(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getslots = async (req, res) => {
  partnerappmiddleware.addstore
    .getslots(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getBBslots = async (req, res) => {
  partnerappmiddleware.addstore
    .getBBslots(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const blockAndUnblockSlot = async (req, res) => {
  partnerappmiddleware.addstore
    .blockAndunblockSlot(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getlocation = async (req, res) => {
  partnerappmiddleware.addstore
    .getlocation(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getproffesional = async (req, res) => {
  partnerappmiddleware.addstore
    .getprofessional(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

export const getproffesionalbyid = async (req, res) => {
  partnerappmiddleware.addstore
    .getprofessionalbyid(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};
// Controller method to fetch the list of students.
export const gethirestudents = async (req, res) => {
  partnerappmiddleware.addstore
    .gethirestudents(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};
// Handles the creation of a Hire Student record.
export const createhirestudent = async (req, res) => {
  partnerappmiddleware.addstore
    .createhirestudent(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

// this function gets today bookings for a partner.
// It checks if the user is authorized, then calls the middleware to fetch today's bookings based on the partner ID.
// The response is structured in JSON format, and any errors are handled gracefully with appropriate status codes and messages.

export const getTodayBookings = async (req, res) => {
  try {
    const { store_id } = req.body;
    if (!store_id) {
      return res.status(400).json({
        success: false,
        message: "Store ID is required",
      });
    }

    const bookings =
      await partnerappmiddleware.addstore.getTodayBookingsByStore(store_id);

    return res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// This functions returns data based on usery query filters.
export const getBookings = async (req, res) => {
  try {
    // console.log("REQ USER:", req.user);
    const data = await partnerappmiddleware.addstore.getBookings({
      user: req.user,
      query: req.query,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// update appointment to cancelled status.
// decline button endpoint.

export const cancelBooking = async (req, res) => {
  try {
    const data = await partnerappmiddleware.addstore.cancelBooking({
      query: req.query,
      user: req.user,
    });

    res.status(200).json({
      success: true,
      message: "Appointment cancelled successfully",
      data,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

// This controller handles the overview metrics request and returns a structured application response.
// It delegates the data fetching to the store middleware and ensures consistent status code handling.
export const getOverview = async (req, res) => {
  partnerappmiddleware.addstore
    .getOverview(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

// Controller for fetching service analytics (breakdown and top earners).
// Delegates to store middleware and returns the result in a standard application response format.
export const getServiceAnalytics = async (req, res) => {
  partnerappmiddleware.addstore
    .getServiceAnalytics(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      var statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status).json(response);
      });
    });
};

// -------------------------- version 2 ----------------------------

export const getPlans = async (req, res) => {
  try {
    const data = await partnerappmiddleware.addstore.getPlans(req);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    ApplicationResponse.error(error, null, (response) => {
      res.status(response.status).json(response);
    });
  }
};

export const createSalonDetails = async (req, res) => {
  partnerappmiddleware.addstore
    .createSalonDetails(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(response, null, (response) => {
        statuscode = response.status;
      });
      res.status(statuscode).json({ status: statuscode, data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

/**
 * ============================================
 * SALON DETAILS CONTROLLERS (v2)
 * ============================================
 *
 * Thin HTTP handlers - delegate business logic to middleware
 * Only responsible for:
 * - Extracting request data (body, user from middleware, files)
 * - Calling appropriate middleware method
 * - Formatting HTTP response (status code, JSON payload)
 * - Error handling
 */

/**
 * POST /v2/store-details
 * Create or initialize salon details (first-time setup)
 *
 * @param {object} req - Express request (body, user in locals, files)
 * @param {object} res - Express response
 */
export const createSalonDetailsv2 = async (req, res) => {
  try {
    // ====================
    // 1. EXTRACT REQUEST DATA
    // ====================
    const { body, files } = req;
    const user = req.user || req.locals?.user;

    // ====================
    // 2. VALIDATE BEFORE CALLING MIDDLEWARE
    // ====================
    if (!user) {
      return res.status(401).json({
        status: 401,
        message: "Unauthorized",
        error: "Authentication required",
      });
    }

    // ====================
    // 3. CALL MIDDLEWARE (BUSINESS LOGIC)
    // ====================
    const data = await partnerappmiddleware.addstore.createSalonDetailsv2({
      body,
      user,
      files,
    });

    // ====================
    // 4. SUCCESS RESPONSE
    // ====================
    res.status(201).json({
      status: 201,
      message: "Salon details created successfully",
      data,
    });
  } catch (error) {
    // ====================
    // 5. ERROR RESPONSE
    // ====================
    ApplicationResponse.error(error, null, (response) => {
      res.status(response.status || 500).json(response);
    });
  }
};

/**
 * PATCH /v2/store/update
 * Partial update of salon details (all fields optional)
 *
 * @param {object} req - Express request (body, user in locals, files)
 * @param {object} res - Express response
 */
export const updateSalonDetailsv2 = async (req, res) => {
  try {
    // ====================
    // 1. EXTRACT REQUEST DATA
    // ====================
    const { body, files } = req;
    const user = req.user || req.locals?.user;

    // ====================
    // 2. VALIDATE BEFORE CALLING MIDDLEWARE
    // ====================
    if (!user) {
      return res.status(401).json({
        status: 401,
        message: "Unauthorized",
        error: "Authentication required",
      });
    }

    // ====================
    // 3. CALL MIDDLEWARE (BUSINESS LOGIC)
    // ====================
    const data = await partnerappmiddleware.addstore.updateSalonDetailsv2({
      body,
      user,
      files,
    });

    // ====================
    // 4. SUCCESS RESPONSE
    // ====================
    res.status(200).json({
      status: 200,
      message: "Salon details updated successfully",
      data,
    });
  } catch (error) {
    // ====================
    // 5. ERROR RESPONSE
    // ====================
    ApplicationResponse.error(error, null, (response) => {
      res.status(response.status || 500).json(response);
    });
  }
};

/**
 * GET /v2/store-details
 * Fetch complete salon details with all related data
 *
 * Returns formatted salon information:
 * - About section, amenities, team members
 * - Operating hours/slots, images, gallery
 *
 * @param {object} req - Express request (user in locals)
 * @param {object} res - Express response
 */
export const getSalonDetailsv2 = async (req, res) => {
  try {
    // ====================
    // 1. EXTRACT REQUEST DATA
    // ====================
    const user = req.user || req.locals?.user;

    // ====================
    // 2. VALIDATE BEFORE CALLING MIDDLEWARE
    // ====================
    if (!user) {
      return res.status(401).json({
        status: 401,
        message: "Unauthorized",
        error: "Authentication required",
      });
    }

    // ====================
    // 3. CALL MIDDLEWARE (BUSINESS LOGIC & RESPONSE FORMATTING)
    // ====================
    const data = await partnerappmiddleware.addstore.getSalonDetailsv2({
      user,
    });

    // ====================
    // 4. SUCCESS RESPONSE
    // ====================
    res.status(200).json({
      status: 200,
      message: "Salon details retrieved successfully",
      data,
    });
  } catch (error) {
    // ====================
    // 5. ERROR RESPONSE
    // ====================
    ApplicationResponse.error(error, null, (response) => {
      res.status(response.status || 500).json(response);
    });
  }
};

export const createSubscriptionOrder = async (req, res) => {
  try {
    const data =
      await partnerappmiddleware.addstore.createSubscriptionOrder(req);
    res.status(200).json({ success: true, data });
  } catch (error) {
    ApplicationResponse.error(error.message, null, (response) => {
      res.status(response.status).json(response);
    });
  }
};

export const verifySubscriptionPayment = async (req, res) => {
  try {
    const data =
      await partnerappmiddleware.addstore.verifySubscriptionPayment(req);
    res
      .status(200)
      .json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    ApplicationResponse.error(error, null, (response) => {
      res.status(response.status).json(response);
    });
  }
};

export const createRecurringSubscription = async (req, res) => {
  try {
    const data = await partnerappmiddleware.addstore.createRecurringSubscription(req);
    res.status(200).json({ success: true, data });
  } catch (error) {
    ApplicationResponse.error(error, null, (response) => {
      res.status(response.status || 500).json(response);
    });
  }
};

export const verifyRecurringSubscription = async (req, res) => {
  try {
    const data = await partnerappmiddleware.addstore.verifyRecurringSubscription(req);
    res.status(200).json({ success: true, data });
  } catch (error) {
    ApplicationResponse.error(error, null, (response) => {
      res.status(response.status || 500).json(response);
    });
  }
};

export const listServiceCategoryV2 = async (req, res) => {
  try {
    const result =
      await partnerappmiddleware.addstore.listServiceCategoryV2(req);
    console.log("result", result);
    return res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    console.log("Db error", error.message);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const listServicesV2 = async (req, res) => {
  partnerappmiddleware.addstore
    .listServicesV2(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

export const updateServiceV2 = async (req, res) => {
  partnerappmiddleware.addstore
    .updateServiceV2(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

export const addServiceV2 = async (req, res) => {
  partnerappmiddleware.addstore
    .addServiceV2(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

export const deleteServiceV2 = async (req, res) => {
  partnerappmiddleware.addstore
    .deleteServiceV2(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

export const createEnquiry = async (req, res) => {
  partnerappmiddleware.addstore
    .createEnquiry(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.status(statuscode).json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

export const getownerprofileV2 = async (req, res) => {
  partnerappmiddleware.addstore
    .getownerprofileV2(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      let statuscode = 0;
      ApplicationResponse.success(
        response,
        null,
        (response) => (statuscode = response.status),
      );
      res.json({ status: statuscode, data: data });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

export const getaminitiesV2 = async (req, res) => {
  partnerappmiddleware.addstore
    .getaminitiesV2(req)
    .then((data) => {
      const response = ApplicationResult.forCreated();
      ApplicationResponse.success(response, null, (response) => {
        res.status(response.status).json({ status: response.status, data });
      });
    })
    .catch((error) => {
      ApplicationResponse.error(error, null, (response) => {
        res.status(response.status || 500).json(response);
      });
    });
};

export const addbankdetailsv2 = async (req, res) => {
  try {
    const data = await partnerappmiddleware.addstore.addbankdetailsv2({
      body: req.body,
      store_id: req.user.id,
    });
    console.log("Controller data:", data);
    res.status(200).json({
      status: 200,
      message: "Bank details added successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      status: 500,
      message: error.message,
    });
  }
};
