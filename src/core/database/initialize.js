import chalk from "chalk";
import ora from 'ora';
import { userDbController } from "./Controller/userDbController.js";
import { connection } from "./connection.js";
import * as models from "./models/index.js";



//Check connection
export const dbConnection = async () => {
  return await connection.authenticate();
};

//Define DB Model Associations

export const modelAssociations = async () => {

  // models.post.belongsTo(models.customer, {
  //   sourceKey: "id",
  //   foreignKey: "customerId",
  // });
};
 





var msg=chalk.yellow('Creating Tables');
const spinner = ora(msg).start();
spinner.color='yellow'

export const dbSync = async () => {


  
  //table associations
  await modelAssociations();

  //sync all Db Models
  await Promise.all(Object.values(models));

  //Create Db Models

  await connection.sync({ force: false });





  var msg=chalk.yellow('Tables Created');
  spinner.succeed(msg);
};




//App configs                  
export const Configurations = async() => {
 
}