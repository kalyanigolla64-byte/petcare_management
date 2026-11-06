CREATE DATABASE IF NOT EXISTS petcare_management;
USE petcare_management;
CREATE TABLE IF NOT EXISTS owners (
 owner_id INT AUTO_INCREMENT PRIMARY KEY,
 owner_name VARCHAR(100) NOT NULL, phone VARCHAR(45),
 email VARCHAR(100), address VARCHAR(45), created_date DATE
);
CREATE TABLE IF NOT EXISTS pets (
 pet_id INT AUTO_INCREMENT PRIMARY KEY, owner_id INT NOT NULL,
 pet_name VARCHAR(100) NOT NULL, species VARCHAR(100), age INT,
 gender VARCHAR(45), registration_date DATE,
 FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS appointments (
 appointment_id INT AUTO_INCREMENT PRIMARY KEY, owner_id INT NOT NULL,
 pet_id INT NOT NULL, appointment_date DATE NOT NULL, reason VARCHAR(255),
 status VARCHAR(45), booking_date DATE,
 FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON UPDATE CASCADE ON DELETE CASCADE,
 FOREIGN KEY (pet_id) REFERENCES pets(pet_id) ON UPDATE CASCADE ON DELETE CASCADE
);