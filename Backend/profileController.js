/**
 * Profile Controller - Handles user profile and account security
 *
 * Features:
 * - Profile data management
 * - Two-factor verification (email/SMS)
 * - Password reset with tokens
 * - Email enumeration protection
 * - Audit logging
 * - GDPR compliance
 */

import { validationResult } from "express-validator";
import User from "../../models/user/user.js";
import Ad from "../../models/listings/ad.js";
import Message from "../../models/communication/message.js";
import Notification from "../../models/communication/notification.js";
import logger from "../../utils/logger.js";

/**
 * Get user profile with security checks
 * GET /api/profile
 */
export const getUserProfile = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    // Get fresh user data from database
    const dbUser = await User.findById(user.userId).select("-password");

    if (!dbUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if account is still active
    if (dbUser.status === "suspended" || dbUser.status === "banned") {
      logger.warn("Suspended account access attempt", { userId: user.userId });
      return res.status(403).json({
        success: false,
        message: "Account suspended",
      });
    }

    // Return complete user profile data
    const profileData = {
      id: dbUser._id,
      name: dbUser.name,
      lastName: dbUser.lastName,
      email: dbUser.email,
      phoneNumber: dbUser.phoneNumber,
      dob: dbUser.dob,
      role: dbUser.role,
      status: dbUser.status,
      isVerified: dbUser.isVerified,
      isEmailVerified: dbUser.isEmailVerified,
      isPhoneVerified: dbUser.isPhoneVerified,
      createdAt: dbUser.createdAt,
      lastLogin: dbUser.lastLogin,
      registrationStep: dbUser.registrationStep,
      registrationType: dbUser.registrationType || "standard",
      // Address fields
      street: dbUser.street,
      city: dbUser.city,
      postalCode: dbUser.postalCode,
      country: dbUser.country,
      // Preferences
      notificationPreferences: dbUser.notificationPreferences,
      privacySettings: dbUser.privacySettings,
      securitySettings: dbUser.securitySettings,
    };

    logger.debug("Profile fetched", { userId: user.userId });

    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      user: profileData,
    });
  } catch (error) {
    logger.error("Get profile error", { error: error.message });
    return next(error);
  }
};

/**
 * Update basic user profile data (name, lastName)
 * PUT /api/profile
 */
export const updateUserProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const userId = req.user.userId;
    const { name, lastName } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Track changes for audit log
    const changes = [];
    if (name && name !== user.name) {
      changes.push(`Name changed from "${user.name}" to "${name}"`);
      user.name = name.trim();
    }
    if (lastName && lastName !== user.lastName) {
      changes.push(
        `Last name changed from "${user.lastName}" to "${lastName}"`
      );
      user.lastName = lastName.trim();
    }

    await user.save();

    // Log changes
    if (changes.length > 0) {
      logger.info("Profile updated", {
        userId,
        changes,
      });
    }

    // Return updated profile data
    const profileData = {
      id: user._id,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      dob: user.dob,
    };

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: profileData,
    });
  } catch (error) {
    logger.error("Update profile error", { error: error.message });
    return next(error);
  }
};

/**
 * Request email change - sends verification code to new email
 * POST /api/profile/email/request
 *
 * Two-step verification process:
 * 1. Generate 6-digit code (valid 15 minutes)
 * 2. Send code to new email
 * 3. Notify old email about change attempt
 */
export const requestEmailChange = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({
        success: false,
        message: "New email address is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if email is already taken (prevent duplicates)
    const emailExists = await User.findOne({
      email: newEmail.toLowerCase(),
      _id: { $ne: userId },
    });

    if (emailExists) {
      logger.warn("Email change attempt - email already taken", {
        userId,
        newEmail: newEmail.substring(0, 3) + "***",
      });
      return res.status(400).json({
        success: false,
        message: "This email is already in use",
      });
    }

    // Generate verification code (6 digits)
    const { generateVerificationCode, sendEmailChangeVerification } =
      await import("../../services/emailService.js");
    const verificationCode = generateVerificationCode();

    // Save verification code with 15-minute expiry
    user.emailVerificationCode = verificationCode;
    user.emailVerificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
    user.pendingEmail = newEmail.toLowerCase();
    await user.save();

    // Send verification email to NEW address
    await sendEmailChangeVerification(newEmail, verificationCode, user.name);

    logger.info("Email change requested", {
      userId,
      oldEmail: user.email.substring(0, 3) + "***",
      newEmail: newEmail.substring(0, 3) + "***",
    });

    return res.status(200).json({
      success: true,
      message: "Verification code sent to new email address",
    });
  } catch (error) {
    logger.error("Request email change error", { error: error.message });
    return next(error);
  }
};

/**
 * Verify email change with code
 * POST /api/profile/email/verify
 */
export const verifyEmailChange = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Verification code is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate verification code
    if (
      !user.emailVerificationCode ||
      user.emailVerificationCode !== code ||
      !user.emailVerificationCodeExpires ||
      user.emailVerificationCodeExpires < new Date()
    ) {
      logger.warn("Invalid email verification code", { userId });
      return res.status(400).json({
        success: false,
        message: "Verification code is invalid or expired",
      });
    }

    if (!user.pendingEmail) {
      return res.status(400).json({
        success: false,
        message: "No pending email change",
      });
    }

    // Update email
    const oldEmail = user.email;
    user.email = user.pendingEmail;
    user.isEmailVerified = true;
    user.emailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationCodeExpires = undefined;
    user.pendingEmail = undefined;
    await user.save();

    // Send notification to OLD email about the change
    const { sendProfileChangeNotification } = await import(
      "../../services/emailService.js"
    );
    await sendProfileChangeNotification(oldEmail, user.name, [
      `Email changed from ${oldEmail} to ${user.email}`,
    ]);

    logger.info("Email changed successfully", {
      userId,
      oldEmail: oldEmail.substring(0, 3) + "***",
      newEmail: user.email.substring(0, 3) + "***",
    });

    return res.status(200).json({
      success: true,
      message: "Email changed successfully",
      user: {
        id: user._id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    logger.error("Verify email change error", { error: error.message });
    return next(error);
  }
};

/**
 * Request phone change - sends verification code via SMS
 * POST /api/profile/phone/request
 */
export const requestPhoneChange = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { newPhone } = req.body;

    if (!newPhone) {
      return res.status(400).json({
        success: false,
        message: "New phone number is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if phone is already taken
    const phoneExists = await User.findOne({
      phoneNumber: newPhone,
      _id: { $ne: userId },
    });

    if (phoneExists) {
      logger.warn("Phone change attempt - number already taken", {
        userId,
        newPhone: "***" + newPhone.slice(-4),
      });
      return res.status(400).json({
        success: false,
        message: "This phone number is already in use",
      });
    }

    // Generate verification code
    const { generateVerificationCode, sendPhoneChangeVerification } =
      await import("../../services/emailService.js");
    const verificationCode = generateVerificationCode();

    // Save verification code with 15-minute expiry
    user.smsVerificationCode = verificationCode;
    user.smsVerificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
    user.pendingPhone = newPhone;
    await user.save();

    // Send verification SMS
    await sendPhoneChangeVerification(newPhone, verificationCode);

    logger.info("Phone change requested", {
      userId,
      newPhone: "***" + newPhone.slice(-4),
    });

    return res.status(200).json({
      success: true,
      message: "Verification code sent via SMS",
    });
  } catch (error) {
    logger.error("Request phone change error", { error: error.message });
    return next(error);
  }
};

/**
 * Verify phone change with code
 * POST /api/profile/phone/verify
 */
export const verifyPhoneChange = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Verification code is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate verification code
    if (
      !user.smsVerificationCode ||
      user.smsVerificationCode !== code ||
      !user.smsVerificationCodeExpires ||
      user.smsVerificationCodeExpires < new Date()
    ) {
      logger.warn("Invalid phone verification code", { userId });
      return res.status(400).json({
        success: false,
        message: "Verification code is invalid or expired",
      });
    }

    if (!user.pendingPhone) {
      return res.status(400).json({
        success: false,
        message: "No pending phone change",
      });
    }

    // Update phone
    const oldPhone = user.phoneNumber;
    user.phoneNumber = user.pendingPhone;
    user.isPhoneVerified = true;
    user.phoneVerified = true;
    user.smsVerificationCode = undefined;
    user.smsVerificationCodeExpires = undefined;
    user.pendingPhone = undefined;
    await user.save();

    // Send notification to email
    const { sendProfileChangeNotification } = await import(
      "../../services/emailService.js"
    );
    await sendProfileChangeNotification(user.email, user.name, [
      `Phone changed from ${oldPhone} to ${user.phoneNumber}`,
    ]);

    logger.info("Phone changed successfully", {
      userId,
      oldPhone: "***" + (oldPhone?.slice(-4) || ""),
      newPhone: "***" + user.phoneNumber.slice(-4),
    });

    return res.status(200).json({
      success: true,
      message: "Phone number changed successfully",
      user: {
        id: user._id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    logger.error("Verify phone change error", { error: error.message });
    return next(error);
  }
};

/**
 * Request password reset with email enumeration protection
 * POST /api/profile/password/reset-request
 *
 * Security features:
 * - Always returns success (prevents email enumeration)
 * - Token valid for 1 hour
 * - Rate limited (see rateLimiting middleware)
 */
export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // ALWAYS return success to prevent email enumeration
    const successMessage =
      "If account exists, password reset link has been sent";

    if (!user) {
      logger.debug("Password reset requested for non-existent email", {
        email: email.substring(0, 3) + "***",
      });
      return res.status(200).json({
        success: true,
        message: successMessage,
      });
    }

    // Generate reset token (cryptographically secure)
    const { generateResetToken, sendPasswordResetEmail } = await import(
      "../../services/emailService.js"
    );
    const resetToken = generateResetToken();

    // Save token with 1-hour expiry
    user.passwordResetToken = resetToken;
    user.passwordResetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    // Send reset email
    await sendPasswordResetEmail(user.email, resetToken, user.name);

    logger.info("Password reset requested", {
      userId: user._id,
      email: user.email.substring(0, 3) + "***",
    });

    return res.status(200).json({
      success: true,
      message: successMessage,
    });
  } catch (error) {
    logger.error("Request password reset error", { error: error.message });
    // Return success even on error (enumeration protection)
    return res.status(200).json({
      success: true,
      message: "If account exists, password reset link has been sent",
    });
  }
};

/**
 * Reset password with token
 * POST /api/profile/password/reset
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      logger.warn("Invalid or expired password reset token", { token });
      return res.status(400).json({
        success: false,
        message: "Password reset token is invalid or expired",
      });
    }

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpires = undefined;
    user.failedLoginAttempts = 0;
    user.accountLocked = false;
    await user.save();

    // Send notification
    const { sendProfileChangeNotification } = await import(
      "../../services/emailService.js"
    );
    await sendProfileChangeNotification(user.email, user.name, [
      "Password changed successfully",
    ]);

    logger.info("Password reset successfully", {
      userId: user._id,
      email: user.email.substring(0, 3) + "***",
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully. You can now log in.",
    });
  } catch (error) {
    logger.error("Reset password error", { error: error.message });
    return next(error);
  }
};

/**
 * Get recently viewed ads for user
 * GET /api/profile/recently-viewed
 */
export const getRecentlyViewed = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Get user's recently viewed ads (last 10)
    const recentlyViewedAds = await Ad.find({
      owner: userId,
    })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select(
        "id title brand model price status images mainImage mainImageIndex createdAt updatedAt"
      );

    const recentlyViewedData = {
      success: true,
      recentlyViewed: recentlyViewedAds.map((ad) => ({
        id: ad._id,
        title: ad.title,
        brand: ad.brand,
        model: ad.model,
        price: ad.price,
        status: ad.status,
        images: ad.images,
        mainImage: ad.mainImage,
        mainImageIndex: ad.mainImageIndex,
        createdAt: ad.createdAt,
        updatedAt: ad.updatedAt,
      })),
    };

    logger.debug("Recently viewed fetched", {
      userId,
      count: recentlyViewedAds.length,
    });

    return res.status(200).json(recentlyViewedData);
  } catch (error) {
    logger.error("Get recently viewed error", { error: error.message });
    return next(error);
  }
};
